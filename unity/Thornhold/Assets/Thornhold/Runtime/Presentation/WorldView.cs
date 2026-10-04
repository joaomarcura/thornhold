using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Thornhold
{
    public sealed class WorldView : MonoBehaviour
    {
        sealed class View
        {
            public GameObject Root;
            public Transform Hand;
            public Vector3 Target, Previous;
            public float Yaw, PreviousYaw, At;
            public string Kind;
            public JObject Data, Attack;
            public Renderer[] Renderers;
        }
        readonly Dictionary<string, View> views = new Dictionary<string, View>();
        readonly List<string> removed = new List<string>();
        readonly HashSet<string> seen = new HashSet<string>();
        readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        readonly List<UnityEngine.Object> owned = new List<UnityEngine.Object>();
        readonly List<Matrix4x4[]> forest = new List<Matrix4x4[]>();
        GameObject scenery;
        Mesh treeMesh;
        Material forestMaterial;
        ThornholdClient client;
        Camera cameraView;
        JObject map;
        AudioSource audioSource;
        AudioClip biteSound, impactSound;
        GameObject bobber, caughtFish;
        LineRenderer fishingLine;
        double catchAt;
        public JObject LastCatch { get; private set; }
        public float Height(float x, float z)
        {
            if (map == null) return 0;
            int size = (int)map["size"]; float cell = map.Number("cell");
            float fx = Mathf.Clamp(x / cell, 0, size - 1.0001f), fz = Mathf.Clamp(z / cell, 0, size - 1.0001f);
            int ix = Mathf.FloorToInt(fx), iz = Mathf.FloorToInt(fz); float u = fx - ix, v = fz - iz;
            var h = (JArray)map["heights"]; float a = (float)h[iz * size + ix], b = (float)h[iz * size + ix + 1];
            float c = (float)h[(iz + 1) * size + ix], d = (float)h[(iz + 1) * size + ix + 1];
            return u >= v ? a * (1 - u) + b * (u - v) + d * v : a * (1 - v) + c * (v - u) + d * u;
        }

        public void Initialize(ThornholdClient owner, Camera playerCamera)
        {
            client = owner; cameraView = playerCamera;
            audioSource = gameObject.AddComponent<AudioSource>(); audioSource.spatialBlend = 0; audioSource.volume = .25f;
            biteSound = Tone("Bite", 880, .14f); impactSound = Tone("Impact", 160, .1f);
            var sun = new GameObject("Sun").AddComponent<Light>(); sun.transform.SetParent(transform);
            sun.type = LightType.Directional; sun.transform.rotation = Quaternion.Euler(48, -35, 0); sun.intensity = 1.2f;
            sun.shadows = LightShadows.None;
            RenderSettings.ambientLight = new Color(.48f, .55f, .61f); RenderSettings.fog = true;
            RenderSettings.fogColor = new Color(.65f, .77f, .83f); RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 90; RenderSettings.fogEndDistance = 270;
            cameraView.backgroundColor = RenderSettings.fogColor;
        }

        Material Material(string key, Color color)
        {
            if (materials.TryGetValue(key, out var existing)) return existing;
            var material = new Material(Resources.Load<Material>("PrototypeLit")) { color = color, enableInstancing = true };
            materials[key] = material; return material;
        }

        GameObject Part(GameObject parent, PrimitiveType primitive, Vector3 local, Vector3 scale, Material material, bool collider = false)
        {
            var part = GameObject.CreatePrimitive(primitive); part.transform.SetParent(parent.transform, false);
            part.transform.localPosition = local; part.transform.localScale = scale;
            var renderer = part.GetComponent<Renderer>(); renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            if (!collider) Destroy(part.GetComponent<Collider>());
            return part;
        }

        public void Build(JObject value)
        {
            Clear(); map = value; scenery = new GameObject("Authoritative Map");
            int size = (int)map["size"]; float cell = map.Number("cell"), extent = (size - 1) * cell;
            var vertices = new Vector3[size * size]; var triangles = new int[(size - 1) * (size - 1) * 6];
            int offset = 0;
            for (int z = 0; z < size; z++) for (int x = 0; x < size; x++)
            {
                int a = z * size + x; vertices[a] = new Vector3(x * cell, (float)map["heights"][a], z * cell);
                if (x == size - 1 || z == size - 1) continue;
                int b = a + 1, c = a + size, d = c + 1;
                triangles[offset++] = a; triangles[offset++] = d; triangles[offset++] = b;
                triangles[offset++] = a; triangles[offset++] = c; triangles[offset++] = d;
            }
            var ground = new Mesh { name = "Server height field", indexFormat = IndexFormat.UInt32, vertices = vertices, triangles = triangles };
            ground.RecalculateNormals(); ground.RecalculateBounds(); owned.Add(ground);
            var terrain = new GameObject("Ground"); terrain.transform.SetParent(scenery.transform);
            terrain.AddComponent<MeshFilter>().sharedMesh = ground;
            terrain.AddComponent<MeshRenderer>().sharedMaterial = Material("grass", new Color(.27f, .39f, .26f));
            terrain.AddComponent<MeshCollider>().sharedMesh = ground;
            float water = map["ocean"].Number("level", -8);
            Part(scenery, PrimitiveType.Cube, new Vector3(extent / 2, water - .05f, extent / 2), new Vector3(extent + 1200, .1f, extent + 1200), Material("water", new Color(.12f, .38f, .46f)));
            foreach (JObject b in map.Rows("bases"))
            {
                var gate = (JObject)b["gate"];
                Part(scenery, PrimitiveType.Cube, gate.Position(b.Number("height") + .03f), new Vector3(3.5f, .05f, 3.5f), Material("gate", new Color(.75f, .59f, .25f)));
                foreach (JObject spot in map.Rows("fishingSpots")) if (spot.Text("baseId") == b.Text("id"))
                    Part(scenery, PrimitiveType.Cube, spot.Position(b.Number("height") + .035f), new Vector3(3, .07f, 2), Material("wood", new Color(.47f, .29f, .13f)));
            }
            foreach (JObject bridge in map.Rows("bridges"))
                foreach (JObject tile in bridge.Rows("cells"))
                    Part(scenery, PrimitiveType.Cube, tile.Position(Height(tile.Number("x"), tile.Number("z")) + .025f), new Vector3(cell, .05f, cell), Material("wood", new Color(.47f, .29f, .13f)));
            // Blocked woodland is GPU-instanced. It is scenery, not a second collision/navigation system.
            var sample = GameObject.CreatePrimitive(PrimitiveType.Cylinder); treeMesh = sample.GetComponent<MeshFilter>().sharedMesh; Destroy(sample);
            forestMaterial = Material("forest", new Color(.14f, .25f, .18f));
            var batch = new List<Matrix4x4>(1023);
            for (int z = 1; z < size - 1; z += 2) for (int x = 1; x < size - 1; x += 2)
            {
                int k = z * size + x;
                if ((int)map["grid"][k] == 0) continue;
                var point = new Vector3(x * cell, (float)map["heights"][k] + 3, z * cell);
                batch.Add(Matrix4x4.TRS(point, Quaternion.identity, new Vector3(1.9f, 3, 1.9f)));
                if (batch.Count == 1023) { forest.Add(batch.ToArray()); batch.Clear(); }
            }
            if (batch.Count > 0) forest.Add(batch.ToArray());
            // Fog/visibility remains server filtered. Static trees are populated from snapshots, not hidden map resources.
            foreach (JObject b in map.Rows("bases"))
            {
                var label = new GameObject(b.Text("name")); label.transform.SetParent(scenery.transform);
                label.transform.position = b.Position(b.Number("height") + 5);
                var text = label.AddComponent<TextMesh>(); text.text = b.Text("name"); text.characterSize = .3f;
                text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); label.GetComponent<Renderer>().sharedMaterial = text.font.material;
                text.anchor = TextAnchor.MiddleCenter; text.color = new Color(1, .86f, .55f);
            }
        }

        public void Sync(JObject state)
        {
            seen.Clear();
            foreach (string collection in new[] { "units", "structures", "trees", "wisps", "specialNodes" })
            foreach (JObject data in state.Rows(collection))
            {
                string id = data.Text("id"), kind = data.Text("kind", collection == "units" ? data.Text("role") : collection == "trees" ? "tree" : collection == "wisps" ? "wisp" : "crystal");
                if (collection == "units" && !data.Flag("alive") && !data.Flag("ghost")) continue;
                if ((collection == "trees" || collection == "specialNodes") && data.Number("amount") <= 0) continue;
                seen.Add(id);
                if (!views.TryGetValue(id, out var view)) { view = Create(id, kind); views[id] = view; view.Root.transform.position = data.Position(Height(data.Number("x"), data.Number("z"))); }
                view.Previous = view.Root.transform.position; view.PreviousYaw = view.Root.transform.eulerAngles.y;
                view.Target = data.Position(Height(data.Number("x"), data.Number("z"))); view.Yaw = data.Number("yaw") * Mathf.Rad2Deg;
                view.At = Time.unscaledTime; view.Data = data;
                if (collection == "structures")
                {
                    float progress = Mathf.Clamp(data.Number("progress", 1), .15f, 1);
                    float tier = 1 + Mathf.Min(4, Mathf.Floor(data.Number("tier", 1) / 6)) * .08f;
                    view.Root.transform.localScale = new Vector3(tier, progress * tier, tier);
                    view.Root.transform.rotation = Quaternion.Euler(0, data.Number("rotation") * Mathf.Rad2Deg, 0);
                }
            }
            removed.Clear(); foreach (var pair in views) if (!seen.Contains(pair.Key)) removed.Add(pair.Key);
            foreach (string id in removed) { Destroy(views[id].Root); views.Remove(id); }
        }

        View Create(string id, string kind)
        {
            var root = new GameObject(kind + " " + id); root.transform.SetParent(transform);
            var tag = root.AddComponent<EntityTag>(); tag.Id = id; tag.Kind = kind;
            var view = new View { Root = root, Kind = kind };
            var wood = Material("wood", new Color(.47f, .29f, .13f)); var stone = Material("stone", new Color(.52f, .58f, .57f));
            switch (kind)
            {
                case "elf": case "troll":
                    float scale = kind == "troll" ? 1.65f : 1;
                    var body = Part(root, PrimitiveType.Capsule, new Vector3(0, scale, 0), new Vector3(.7f, scale, .7f), Material(kind, kind == "troll" ? new Color(.38f, .48f, .24f) : new Color(.25f, .67f, .53f)), true);
                    var head = Part(root, PrimitiveType.Sphere, new Vector3(0, 2 * scale, 0), Vector3.one * .55f, stone);
                    var hand = new GameObject("Weapon pivot"); hand.transform.SetParent(root.transform, false); hand.transform.localPosition = new Vector3(.5f, 1.1f * scale, .15f); view.Hand = hand.transform;
                    Part(hand, PrimitiveType.Cube, new Vector3(0, 0, .35f), new Vector3(.09f, .09f, .75f), wood);
                    Part(hand, PrimitiveType.Cube, new Vector3(0, 0, .7f), new Vector3(.45f, .25f, .2f), stone);
                    break;
                case "core":
                    Part(root, PrimitiveType.Cylinder, new Vector3(0, 1, 0), new Vector3(2.5f, 1, 2.5f), stone, true);
                    Part(root, PrimitiveType.Cylinder, new Vector3(0, 2.4f, 0), new Vector3(3, .4f, 3), wood); break;
                case "wall": Part(root, PrimitiveType.Cube, new Vector3(0, 1.2f, 0), new Vector3(3.8f, 2.4f, 1), wood, true); break;
                case "tower":
                    Part(root, PrimitiveType.Cylinder, new Vector3(0, 1.8f, 0), new Vector3(1.7f, 1.8f, 1.7f), stone, true);
                    Part(root, PrimitiveType.Cube, new Vector3(0, 3.7f, 0), new Vector3(2.1f, .4f, 2.1f), wood); break;
                case "mine": Part(root, PrimitiveType.Cube, new Vector3(0, .7f, 0), new Vector3(2, 1.4f, 2), stone, true); break;
                case "fishery":
                    Part(root, PrimitiveType.Cube, new Vector3(0, 1, 0), new Vector3(2.2f, 2, 2), wood, true);
                    Part(root, PrimitiveType.Cube, new Vector3(0, 2.15f, 0), new Vector3(2.6f, .3f, 2.5f), stone); break;
                case "tree":
                    Part(root, PrimitiveType.Cylinder, new Vector3(0, 1, 0), new Vector3(.45f, 1, .45f), wood, true);
                    Part(root, PrimitiveType.Sphere, new Vector3(0, 2.5f, 0), new Vector3(2, 2.3f, 2), forestMaterial); break;
                case "wisp": Part(root, PrimitiveType.Sphere, new Vector3(0, 1, 0), Vector3.one * .35f, Material("crystal", new Color(.45f, .82f, .95f))); break;
                default: Part(root, PrimitiveType.Cube, new Vector3(0, .65f, 0), new Vector3(.65f, 1.3f, .65f), Material("crystal", new Color(.45f, .82f, .95f)), true); break;
            }
            view.Renderers = root.GetComponentsInChildren<Renderer>(); return view;
        }

        public void Event(JObject action)
        {
            string type = action.Text("type");
            if (type == "attack-animation" && views.TryGetValue(action.Text("unit"), out var view))
            {
                if (action.Text("phase") == "finished") view.Attack = null; else view.Attack = action;
                if (action.Text("phase") == "impact" && action.Flag("hit")) audioSource.PlayOneShot(impactSound);
            }
            if (action.Text("unit") != client.ViewerId) return;
            if (type == "fishing-bite") audioSource.PlayOneShot(biteSound);
            if (type == "fish-caught") { LastCatch = (JObject)action["fish"]; catchAt = client.RenderTime; }
        }

        public Transform EntityTransform(string id) => id != null && views.TryGetValue(id, out var view) ? view.Root.transform : null;
        public float AttackSwing(string id)
        {
            if (id == null || !views.TryGetValue(id, out var view) || view.Attack == null) return 0;
            double now = client.RenderTime, start = view.Attack.Number("startedAt"), impact = view.Attack.Number("impactAt"), end = view.Attack.Number("finishedAt");
            if (now < start || now >= end) return 0;
            if (now < impact) return -Mathf.SmoothStep(0, 1, (float)((now - start) / Math.Max(.01, impact - start)));
            return Mathf.Lerp(1.2f, 0, (float)((now - impact) / Math.Max(.01, end - impact)));
        }

        void LateUpdate()
        {
            if (map == null) return;
            if (SystemInfo.supportsInstancing) foreach (var batch in forest) Graphics.DrawMeshInstanced(treeMesh, 0, forestMaterial, batch, batch.Length, null, ShadowCastingMode.Off, false, 0, cameraView);
            foreach (var pair in views)
            {
                var view = pair.Value;
                if (view.Kind == "elf" || view.Kind == "troll" || view.Kind == "wisp")
                {
                    float fraction = Mathf.Clamp01((Time.unscaledTime - view.At) / .1f);
                    view.Root.transform.position = Vector3.Lerp(view.Previous, view.Target, fraction);
                    view.Root.transform.rotation = Quaternion.Euler(0, Mathf.LerpAngle(view.PreviousYaw, view.Yaw, fraction), 0);
                }
                if (view.Hand != null)
                {
                    float swing = AttackSwing(pair.Key);
                    if (view.Data.Text("action") == "repair" || view.Data.Text("action") == "gather") swing = Mathf.Sin((float)client.RenderTime * 12);
                    view.Hand.localRotation = Quaternion.Euler(-swing * 65, swing * 25, 0);
                }
                bool hidden = pair.Key == client.ViewerId && client.Controls.FirstPerson;
                foreach (var renderer in view.Renderers) renderer.enabled = !hidden;
            }
            Fishing();
        }

        void Fishing()
        {
            var me = client.Me; var fishing = me?["fishing"] as JObject;
            if (bobber == null)
            {
                bobber = Part(gameObject, PrimitiveType.Sphere, Vector3.zero, Vector3.one * .18f, Material("bobber", Color.red));
                fishingLine = new GameObject("Fishing line").AddComponent<LineRenderer>(); fishingLine.transform.SetParent(transform);
                fishingLine.positionCount = 2; fishingLine.startWidth = fishingLine.endWidth = .025f;
                fishingLine.sharedMaterial = Material("line", new Color(.85f, .88f, .82f));
                caughtFish = Part(cameraView.gameObject, PrimitiveType.Sphere, new Vector3(0, .05f, 1.4f), new Vector3(.65f, .24f, .17f), Material("fish", new Color(.84f, .71f, .38f)));
            }
            bool showCatch = LastCatch != null && client.RenderTime - catchAt < 3.5 && me != null && me.Flag("alive") && me.Text("action") != "walk" && fishing == null;
            caughtFish.SetActive(showCatch);
            if (showCatch) caughtFish.transform.localRotation = Quaternion.Euler(0, (float)(client.RenderTime - catchAt) * 70, 0);
            bobber.SetActive(fishing != null); fishingLine.enabled = fishing != null;
            if (fishing == null) return;
            var water = fishing["water"].Position(fishing["water"].Number("y"));
            bool reeling = fishing.Text("phase") == "reel";
            if (reeling)
            {
                float phase = Mathf.Clamp01((float)((client.RenderTime - fishing.Number("hookedAt")) / Math.Max(.01, fishing.Number("reelUntil") - fishing.Number("hookedAt"))));
                water = Vector3.Lerp(water, me.Position(Height(me.Number("x"), me.Number("z")) + 1.2f), phase);
                // Offshore is seabed, not the clamped height of the last map cell.
                float extent = (map.Number("size") - 1) * map.Number("cell");
                float ground = water.x < 0 || water.z < 0 || water.x > extent || water.z > extent ? map["ocean"].Number("level") - 1.4f : Height(water.x, water.z);
                water.y = Mathf.Max(water.y, ground + .15f);
            }
            else water.y += fishing.Text("phase") == "bite" ? -.12f : Mathf.Sin((float)client.RenderTime * 3) * .025f;
            bobber.transform.position = water;
            fishingLine.SetPosition(0, cameraView.transform.position + cameraView.transform.forward * .5f + cameraView.transform.right * .2f);
            fishingLine.SetPosition(1, water);
        }

        public bool CatchVisible => caughtFish != null && caughtFish.activeSelf;
        AudioClip Tone(string name, float frequency, float duration)
        {
            int count = Mathf.RoundToInt(22050 * duration); var samples = new float[count];
            for (int i = 0; i < count; i++) samples[i] = Mathf.Sin(i * frequency * 2 * Mathf.PI / 22050) * Mathf.Pow(1 - (float)i / count, 2) * .3f;
            var clip = AudioClip.Create(name, count, 1, 22050, false); clip.SetData(samples, 0); owned.Add(clip); return clip;
        }

        public void Clear()
        {
            foreach (var view in views.Values) Destroy(view.Root); views.Clear(); forest.Clear();
            if (scenery != null) Destroy(scenery); scenery = null; map = null; LastCatch = null;
            if (bobber != null) bobber.SetActive(false); if (caughtFish != null) caughtFish.SetActive(false); if (fishingLine != null) fishingLine.enabled = false;
            // Terrain meshes are map-owned; audio clips live for the client lifetime.
            for (int i = owned.Count - 1; i >= 0; i--) if (owned[i] is Mesh) { Destroy(owned[i]); owned.RemoveAt(i); }
        }
        void OnDestroy() { Clear(); foreach (var value in owned) Destroy(value); foreach (var material in materials.Values) Destroy(material); }
    }
}
