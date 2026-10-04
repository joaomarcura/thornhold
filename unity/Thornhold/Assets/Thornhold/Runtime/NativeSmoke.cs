using System;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Thornhold
{
    // Explicit opt-in build smoke test. Uses the same scene, transport, store and renderer as the player.
    // Never grants production authority: test commands are accepted only by the isolated DEV server.
    [DefaultExecutionOrder(2000)]
    public sealed class NativeSmoke : MonoBehaviour
    {
        ThornholdClient client;
        string role;
        int phase;
        float deadline, moveUntil, nextSend;
        long sequence;
        Vector3 before, direction;
        string capturePath;
        float captureAfter;

        void Start()
        {
            client = GetComponent<ThornholdClient>(); var args = Environment.GetCommandLineArgs();
            int i = Array.IndexOf(args, "-thornholdSmoke"); client.Address = args[i + 1];
            i = Array.IndexOf(args, "-thornholdRole"); role = i >= 0 ? args[i + 1] : "observer";
            i = Array.IndexOf(args, "-thornholdCapture"); capturePath = i >= 0 ? args[i + 1] : null;
            client.PlayerName = "Unity native smoke"; client.Role = role == "coop" ? "elf" : role;
            deadline = Time.unscaledTime + 65; client.Connect();
        }

        void Update()
        {
            if (Time.unscaledTime > deadline) { Fail("Timeout phase " + phase + " · " + client.Status); return; }
            if (phase == 0 && client.ClientId != null) { client.CreateRoom(role == "coop"); phase = 1; }
            else if (phase == 1 && client.Room != null)
            { client.Send(new JObject { ["type"] = "ready", ["ready"] = true }); phase = 2; }
            else if (phase == 2 && client.Room.Rows("errors").Count == 0)
            { client.Send(JsonData.Message("start")); phase = 3; }
            else if (phase == 3 && client.Snapshots.State != null)
            {
                client.MenuOpen = true; // The input driver must not send idle packets over the scripted movement.
                if (role == "observer")
                {
                    if (client.ViewerId != null || client.Snapshots.State.Rows("units").Count != 6) { Fail("Invalid observer roster"); return; }
                    sequence = client.Snapshots.Sequence; phase = 7; return;
                }
                if (client.Me == null || client.World.EntityTransform(client.ViewerId) == null) { Fail("Own world model missing"); return; }
                if (role == "coop" && (!client.Map.Flag("coop") || client.Map.Rows("coopTunnels").Count == 0)) { Fail("Co-op tunnels missing"); return; }
                if (role == "troll")
                {
                    client.Send(new JObject { ["type"] = "dev", ["command"] = "speed", ["speed"] = 16 }); phase = 4;
                }
                else BeginMovement();
            }
            else if (phase == 4 && client.Snapshots.State.Text("state") == "MATCH_ACTIVE")
            {
                client.Send(new JObject { ["type"] = "dev", ["command"] = "speed", ["speed"] = 1 });
                client.Send(new JObject { ["type"] = "dev", ["command"] = "grant", ["gold"] = 1000 });
                client.Action("buy", null, new JObject { ["key"] = "damage" }); phase = 5;
            }
            else if (phase == 5 && client.Me["levels"].Number("damage") > 0) BeginMovement();
            else if (phase == 6)
            {
                if (Time.unscaledTime < moveUntil)
                {
                    if (Time.unscaledTime < nextSend) return; nextSend = Time.unscaledTime + .05f;
                    client.Send(new JObject { ["type"] = "input", ["x"] = direction.x, ["z"] = direction.z, ["yaw"] = 0 });
                }
                else
                {
                    client.Controls.Stop();
                    if (Vector3.Distance(client.Me.Position(), before) < .25f) { Fail("Authoritative movement did not advance"); return; }
                    sequence = client.Snapshots.Sequence; phase = 7;
                }
            }
            else if (phase == 7 && client.Snapshots.Sequence > sequence + 4)
            {
                if (capturePath != null) { client.MenuOpen = false; captureAfter = Time.unscaledTime + .5f; phase = 9; }
                else { client.Send(JsonData.Message("leave")); phase = 8; }
            }
            else if (phase == 8 && client.Map == null && client.Room == null)
            { Debug.Log("THORNHOLD_NATIVE_SMOKE_OK: " + role + " · scene/map/models/deltas/input/leave validated"); enabled = false; Application.Quit(0); }
        }

        void BeginMovement()
        {
            before = client.Me.Position(); float cell = client.Map.Number("cell"); int size = (int)client.Map.Number("size");
            int x = Mathf.RoundToInt(before.x / cell), z = Mathf.RoundToInt(before.z / cell); direction = Vector3.right;
            foreach (var offset in new[] { Vector3.right, Vector3.left, Vector3.forward, Vector3.back })
            {
                int nx = x + (int)offset.x, nz = z + (int)offset.z;
                if (nx < 0 || nz < 0 || nx >= size || nz >= size || (int)client.Map["grid"][nz * size + nx] != 0) continue;
                direction = offset; break;
            }
            moveUntil = Time.unscaledTime + 1.5f; phase = 6;
        }
        void Fail(string message) { enabled = false; Debug.LogError("THORNHOLD_NATIVE_SMOKE_FAILED: " + role + " " + message); Application.Quit(2); }

        void LateUpdate()
        {
            if (phase != 9 || Time.unscaledTime <= captureAfter) return;
            // Capture after camera positioning and this frame's instanced draw submissions.
            Capture(); if (!enabled) return; client.Send(JsonData.Message("leave")); phase = 8;
        }

        void Capture()
        {
            var camera = Camera.main;
            if (camera == null) { Fail("No active main camera"); return; }
            // A hidden Windows player can suppress backbuffer presentation. Render the real
            // camera through URP into an offscreen target; do not accept a blank screenshot.
            var target = RenderTexture.GetTemporary(1280, 720, 24, RenderTextureFormat.ARGB32);
            var pixels = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            var previous = RenderTexture.active;
            try
            {
                var request = new RenderPipeline.StandardRequest { destination = target };
                if (!RenderPipeline.SupportsRenderRequest(camera, request)) { Fail("URP render request unsupported"); return; }
                RenderPipeline.SubmitRenderRequest(camera, request);
                RenderTexture.active = target; pixels.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0); pixels.Apply();
                var colors = pixels.GetPixels32(); var first = colors[0]; bool different = false;
                for (int i = 64; i < colors.Length; i += 64)
                    if (Math.Abs(colors[i].r - first.r) + Math.Abs(colors[i].g - first.g) + Math.Abs(colors[i].b - first.b) > 20) { different = true; break; }
                if (!different) { Fail("Render is blank/uniform"); return; }
                File.WriteAllBytes(capturePath, pixels.EncodeToPNG()); Debug.Log("THORNHOLD_GPU_CAPTURE_OK: " + capturePath);
            }
            catch (Exception error) { Fail("GPU capture failed: " + error.Message); }
            finally { RenderTexture.active = previous; RenderTexture.ReleaseTemporary(target); Destroy(pixels); }
        }
    }
}
