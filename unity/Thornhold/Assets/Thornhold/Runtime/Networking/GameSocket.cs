using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Thornhold.Networking
{
    // Native desktop transport. Unity objects are touched only by the main-thread consumer.
    public sealed class GameSocket : IDisposable
    {
        const int MaxMessageBytes = 8 * 1024 * 1024;
        const int MaxQueuedMessages = 256;
        readonly ConcurrentQueue<JObject> incoming = new ConcurrentQueue<JObject>();
        readonly SemaphoreSlim sendLock = new SemaphoreSlim(1, 1);
        readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        readonly ClientWebSocket socket = new ClientWebSocket();
        Task receiveTask;
        int queued;
        int disposed;
        public string Error { get; private set; }
        public bool Connected => socket.State == WebSocketState.Open;
        public long ReceivedBytes { get; private set; }
        public long SentBytes { get; private set; }

        public async Task Connect(string address)
        {
            var uri = new Uri(address);
            if (uri.Scheme != "wss" && !(uri.Scheme == "ws" && uri.IsLoopback))
                throw new ArgumentException("Use wss:// for remote servers; ws:// is allowed only on localhost.");
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token))
            {
                timeout.CancelAfter(15000);
                await socket.ConnectAsync(uri, timeout.Token).ConfigureAwait(false);
            }
            receiveTask = Receive();
        }

        public async Task Send(JObject message)
        {
            if (!Connected) throw new InvalidOperationException("Server disconnected.");
            byte[] bytes = Encoding.UTF8.GetBytes(message.ToString(Formatting.None));
            if (bytes.Length > 16384) throw new ArgumentException("Command too large.");
            await sendLock.WaitAsync(lifetime.Token).ConfigureAwait(false);
            try { await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, lifetime.Token).ConfigureAwait(false); SentBytes += bytes.Length; }
            finally { sendLock.Release(); }
        }

        public bool TryRead(out JObject message)
        {
            if (!incoming.TryDequeue(out message)) return false;
            Interlocked.Decrement(ref queued);
            return true;
        }

        async Task Receive()
        {
            var buffer = new byte[8192];
            using (var body = new MemoryStream())
            {
                try
                {
                    while (!lifetime.IsCancellationRequested && Connected)
                    {
                        var chunk = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), lifetime.Token).ConfigureAwait(false);
                        if (chunk.MessageType == WebSocketMessageType.Close) { Error = "Server closed the connection."; break; }
                        if (chunk.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Unexpected binary message.");
                        if (body.Length + chunk.Count > MaxMessageBytes) throw new InvalidDataException("Server message exceeds client limit.");
                        body.Write(buffer, 0, chunk.Count); ReceivedBytes += chunk.Count;
                        if (!chunk.EndOfMessage) continue;
                        var text = Encoding.UTF8.GetString(body.GetBuffer(), 0, (int)body.Length); body.SetLength(0);
                        var message = JObject.Parse(text);
                        if (Interlocked.Increment(ref queued) > MaxQueuedMessages) throw new InvalidDataException("Client queue overflow; reconnect required.");
                        incoming.Enqueue(message);
                    }
                }
                catch (OperationCanceledException) { }
                catch (Exception error) { Error = error.Message; }
                finally { try { socket.Abort(); } catch (ObjectDisposedException) { } }
            }
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref disposed, 1) != 0) return;
            lifetime.Cancel(); socket.Abort(); socket.Dispose();
            // A background send/receive can still unwind; do not dispose its semaphore/CTS underneath it.
            while (incoming.TryDequeue(out _)) { }
            Interlocked.Exchange(ref queued, 0);
        }
    }
}
