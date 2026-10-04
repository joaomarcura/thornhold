using Newtonsoft.Json.Linq;
using Thornhold.Networking;

static void Require(bool value, string message) { if (!value) throw new Exception(message); }
static void Reject(Action action, string message)
{ bool failed = false; try { action(); } catch (InvalidOperationException) { failed = true; } Require(failed, message); }
var fixture = JObject.Parse(File.ReadAllText(args[0]));
var state = new SnapshotStore(); state.Full((JObject)fixture["initial"], 1);
foreach (JObject step in fixture["steps"])
{
    state.Delta((JObject)step["delta"]);
    Require(JToken.DeepEquals(state.State, step["expected"]), "C# delta diverged from Node truth at " + state.Sequence);
}
string before = state.State.ToString(); long sequence = state.Sequence;
Reject(() => state.Delta(new JObject { ["seq"] = sequence + 2 }), "Must reject a missing snapshot");
Require(state.Sequence == sequence && state.State.ToString() == before, "Rejected delta changed state");
Reject(() => state.Delta(JObject.Parse($"{{'seq':{sequence + 1},'collections':{{'units':{{'patch':[{{'id':'missing','set':{{'hp':1}}}}]}}}}}}")), "Must reject unknown entity");
Require(state.State.ToString() == before, "Invalid entity changed state");
state.Reset(); Require(state.State == null && state.Sequence == 0, "Reset left stale visible entities");
Console.WriteLine("PASS: Node/C# snapshot parity, event replacement, entity removal, sequence gaps, invalid patches, reset.");

using (var unsafeSocket = new GameSocket())
{
    bool rejected = false; try { await unsafeSocket.Connect("ws://example.com"); } catch (ArgumentException) { rejected = true; }
    Require(rejected, "Remote plaintext websocket must be rejected");
}

foreach (string role in new[] { "elf", "troll", "observer", "coop" })
{
    using var socket = new GameSocket(); await socket.Connect(args[1]);
    await socket.Send(new JObject { ["type"] = "hello", ["name"] = "Unity protocol test" });
    var hello = await Wait(socket, "hello"); string token = (string)hello["token"];
    Require((int)hello["release"]["protocol"] == (int)fixture["protocol"], "Release protocol mismatch");
    if (role == "coop")
    { await socket.Send(new JObject { ["type"] = "partyCreate" }); await socket.Send(new JObject { ["type"] = "partyRoom", ["coopBot"] = true }); }
    else await socket.Send(new JObject { ["type"] = "create", ["name"] = "Unity integration", ["role"] = role, ["fillBots"] = true,
        ["settings"] = new JObject { ["mode"] = "custom", ["private"] = true, ["local"] = role == "observer", ["elfSlots"] = 5, ["seed"] = "UNITY-INTEGRATION", ["preparation"] = 20 } });
    await Wait(socket, "lobby"); await socket.Send(new JObject { ["type"] = "ready", ["ready"] = true });
    await Wait(socket, "lobby", value => ((JArray)value["room"]["errors"]).Count == 0);
    await socket.Send(new JObject { ["type"] = "start" }); var map = await Wait(socket, "map");
    string viewer = (string)map["viewerId"]; var full = await Wait(socket, "snapshot");
    var live = new SnapshotStore(); live.Full((JObject)full["snapshot"], (long)full["seq"]);
    Require(((JArray)live.State["units"]).Count >= (role == "troll" ? 1 : 6), "Expected visible roster");
    if (role == "observer") Require(viewer == null, "Observer controls a player");
    else Require(live.Entity("units", viewer) != null, "No authoritative own unit");
    if (role == "coop") Require((bool)map["map"]["coop"] && ((JArray)map["map"]["coopTunnels"]).Count > 0, "Co-op map/tunnels missing");
    for (int i = 0; i < 8; i++) { var delta = await Wait(socket, "snapshotDelta"); live.Delta((JObject)delta["delta"]); }
    Require(live.Sequence >= 9, "Delta stream stopped");
    // Resume handshake is the only supported full-state resync; no new debug endpoint.
    socket.Dispose(); using var resumed = new GameSocket(); await resumed.Connect(args[1]);
    await resumed.Send(new JObject { ["type"] = "hello", ["name"] = "Unity protocol test", ["token"] = token });
    var resumedHello = await Wait(resumed, "hello"); Require((string)resumedHello["id"] == (string)hello["id"], "Resume changed player identity");
    await Wait(resumed, "map"); var fresh = await Wait(resumed, "snapshot");
    Require(fresh["snapshot"] is JObject, "Resume did not supply full snapshot");
    await resumed.Send(new JObject { ["type"] = "leave" }); await Wait(resumed, "left");
    Console.WriteLine("PASS: native ClientWebSocket hello/lobby/start/map/full/delta/resume/leave — " + role);
}

static async Task<JObject> Wait(GameSocket socket, string type, Func<JObject, bool> predicate = null)
{
    var deadline = DateTime.UtcNow.AddSeconds(12);
    while (DateTime.UtcNow < deadline)
    {
        while (socket.TryRead(out var message))
        {
            if ((string)message["type"] == "error") throw new Exception("Server rejected test: " + (string)message["message"]);
            if ((string)message["type"] == type && (predicate == null || predicate(message))) return message;
        }
        if (!socket.Connected) throw new Exception("Transport disconnected: " + socket.Error);
        await Task.Delay(10);
    }
    throw new TimeoutException("Waiting for " + type);
}
