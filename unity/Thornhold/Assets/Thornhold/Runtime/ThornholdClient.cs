using System;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Thornhold.Networking;
using UnityEngine;

namespace Thornhold
{
    public sealed class ThornholdClient : MonoBehaviour
    {
        public readonly SnapshotStore Snapshots = new SnapshotStore();
        public GameSocket Socket { get; private set; }
        public JObject Contract { get; private set; }
        public JObject Room { get; private set; }
        public JObject Map { get; private set; }
        public JObject Result { get; private set; }
        public string ClientId { get; private set; }
        public string ViewerId { get; private set; }
        public string Status { get; private set; } = "Conecte ao servidor local para começar.";
        public string Address = "ws://localhost:3000";
        public string PlayerName = "Viajante Unity";
        public string JoinCode = "";
        public string Difficulty = "normal";
        public string Role = "elf";
        public bool MenuOpen = true;
        public bool DevMode { get; private set; }
        public float PingMs { get; private set; }
        public double RenderTime => Snapshots.State.Number("time") + Math.Min(.2, Time.unscaledTime - snapshotAt) * Snapshots.State.Number("clockRate", 1.25f);
        public JObject Me => ViewerId == null ? null : Snapshots.Entity("units", ViewerId);
        public WorldView World { get; private set; }
        public PlayerControls Controls { get; private set; }
        string resumeToken;
        string connectedAddress;
        float snapshotAt, nextPing, nextReconnect;
        long lastEvent;
        bool connecting, reconnectWanted, quitting;
        int retries;

        void Awake()
        {
            Application.targetFrameRate = 144; QualitySettings.vSyncCount = 0;
            Contract = JObject.Parse(File.ReadAllText(Path.Combine(Application.streamingAssetsPath, "thornhold-contract.json")));
            World = gameObject.AddComponent<WorldView>();
            Controls = gameObject.AddComponent<PlayerControls>();
            gameObject.AddComponent<PrototypeHud>();
            var camera = new GameObject("Player Camera").AddComponent<Camera>();
            camera.tag = "MainCamera";
            camera.gameObject.AddComponent<AudioListener>(); camera.nearClipPlane = .05f; camera.farClipPlane = 650;
            Controls.Initialize(this, camera); World.Initialize(this, camera);
            SetCursor(false);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-thornholdSmoke") >= 0) gameObject.AddComponent<NativeSmoke>();
        }

        public async void Connect()
        {
            if (connecting || quitting) return;
            connecting = true; reconnectWanted = true; Status = "Conectando…";
            try
            {
                // Reuse a resume token only for the same destination; never leak it to another host.
                if (connectedAddress != Address) { resumeToken = null; ClearMatch(); ClientId = null; }
                Socket?.Dispose(); Socket = new GameSocket(); await Socket.Connect(Address);
                connectedAddress = Address;
                await Socket.Send(new JObject { ["type"] = "hello", ["name"] = PlayerName, ["token"] = resumeToken });
            }
            catch (Exception error) { Status = "Falha de conexão: " + error.Message; nextReconnect = Time.unscaledTime + Math.Min(8, 1 << Math.Min(3, retries++)); }
            finally { connecting = false; }
        }

        public async void Send(JObject message)
        {
            try { if (Socket != null) await Socket.Send(message); }
            catch (Exception error) { Status = error.Message; }
        }

        public void Action(string type, string target = null, JObject data = null)
        {
            var command = data ?? new JObject(); command["type"] = type;
            if (target != null) command["target"] = target;
            Send(new JObject { ["type"] = "action", ["command"] = command });
        }

        void Update()
        {
            int consumed = 0;
            while (Socket != null && consumed++ < 64 && Socket.TryRead(out var message))
            {
                try { Handle(message); }
                catch (Exception error)
                {
                    Status = "Sincronização interrompida: " + error.Message;
                    Socket.Dispose(); ClearMatch(); MenuOpen = true; SetCursor(false); nextReconnect = Time.unscaledTime + 1;
                    break;
                }
            }
            if (Socket != null && !Socket.Connected && !connecting && reconnectWanted && !quitting)
            {
                if (Map != null) { Controls.Stop(); ClearMatch(); MenuOpen = true; SetCursor(false); Status = "Conexão perdida; retomando a sessão…"; }
                if (Time.unscaledTime >= nextReconnect) { nextReconnect = Time.unscaledTime + 8; Connect(); }
                return;
            }
            if (Socket?.Connected == true && Time.unscaledTime >= nextPing)
            {
                nextPing = Time.unscaledTime + 2;
                Send(new JObject { ["type"] = "ping", ["sent"] = (long)(Time.realtimeSinceStartupAsDouble * 1000) });
            }
        }

        void Handle(JObject message)
        {
            switch (message.Text("type"))
            {
                case "hello":
                    if ((int?)message["release"]?["protocol"] != (int?)Contract["release"]?["protocol"])
                    { reconnectWanted = false; Socket.Dispose(); throw new InvalidOperationException("Protocolo incompatível. Atualize o cliente."); }
                    ClientId = message.Text("id"); resumeToken = message.Text("token"); DevMode = message.Flag("devMode");
                    retries = 0; Status = "Servidor conectado · " + message["release"].Text("game"); break;
                case "lobby": Room = (JObject)message["room"]; break;
                case "map":
                    ClearMatch(); Map = (JObject)message["map"]; ViewerId = (string)message["viewerId"];
                    World.Build(Map); MenuOpen = false; SetCursor(true); break;
                case "snapshot": Snapshots.Full((JObject)message["snapshot"], (long)message["seq"]); SnapshotChanged(); break;
                case "snapshotDelta": Snapshots.Delta((JObject)message["delta"]); SnapshotChanged(); break;
                case "result": Result = (JObject)message["result"]; MenuOpen = true; Controls.Stop(); SetCursor(false); break;
                case "left": ClearMatch(); Room = null; MenuOpen = true; SetCursor(false); break;
                case "phase": if (message.Text("state") == "RETURN_TO_LOBBY") { ClearMatch(); MenuOpen = true; SetCursor(false); } break;
                case "actionError": case "error": Status = message.Text("message"); break;
                case "pong": PingMs = (float)(Time.realtimeSinceStartupAsDouble * 1000 - ((double?)message["sent"] ?? 0)); break;
            }
        }

        void SnapshotChanged()
        {
            snapshotAt = Time.unscaledTime;
            World.Sync(Snapshots.State);
            foreach (JObject action in Snapshots.State.Rows("events"))
            {
                long id = (long?)action["id"] ?? 0;
                if (id <= lastEvent) continue;
                lastEvent = id; World.Event(action);
            }
        }

        public void CreateRoom(bool coop = false)
        {
            if (coop)
            {
                Send(new JObject { ["type"] = "partyCreate" });
                Send(new JObject { ["type"] = "partyRoom", ["coopBot"] = true });
                return;
            }
            Send(new JObject { ["type"] = "create", ["name"] = "Thornhold Unity · Protótipo", ["role"] = Role, ["fillBots"] = true,
                ["settings"] = new JObject { ["mode"] = "custom", ["local"] = Role == "observer", ["private"] = true, ["elfSlots"] = 5,
                    ["difficulty"] = Difficulty, ["seed"] = "UNITY-" + Guid.NewGuid().ToString("N").Substring(0, 8) } });
        }

        public void SetCursor(bool captured)
        {
            Cursor.lockState = captured ? CursorLockMode.Locked : CursorLockMode.None; Cursor.visible = !captured;
        }
        public void ToggleMenu()
        {
            MenuOpen = !MenuOpen; Controls.Stop(); SetCursor(!MenuOpen && Map != null);
        }
        void ClearMatch() { Map = null; Result = null; ViewerId = null; Snapshots.Reset(); lastEvent = 0; World?.Clear(); }
        void OnApplicationFocus(bool focus) { if (!focus) { Controls?.Stop(); SetCursor(false); MenuOpen = true; } }
        void OnApplicationQuit() { quitting = true; reconnectWanted = false; Socket?.Dispose(); }
        void OnDestroy() { reconnectWanted = false; Socket?.Dispose(); }
    }
}
