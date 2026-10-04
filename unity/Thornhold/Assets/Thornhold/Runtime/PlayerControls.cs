using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Thornhold
{
    // Input/presentation only. Movement, collision, purchases and damage remain server-owned.
    public sealed class PlayerControls : MonoBehaviour
    {
        ThornholdClient client;
        Camera cameraView;
        GameObject tool;
        Renderer toolRenderer;
        Material toolMaterial;
        float yaw, pitch = 18, nextInput, nextInteraction;
        string buildKind, followId;
        int followIndex;
        Vector3 freePosition;
        bool cameraPlaced;
        public bool FirstPerson { get; private set; }
        public string SelectedId { get; private set; }
        public string BuildKind => buildKind;
        public string ToolName => client.Me.Flag("rodEquipped") ? "Vara" : "Martelo";

        public void Initialize(ThornholdClient owner, Camera view)
        {
            client = owner; cameraView = view;
            tool = GameObject.CreatePrimitive(PrimitiveType.Cube); Destroy(tool.GetComponent<Collider>());
            tool.name = "First person tool pivot"; tool.transform.SetParent(view.transform, false);
            toolMaterial = new Material(Resources.Load<Material>("PrototypeLit")); toolMaterial.color = new Color(.55f, .37f, .18f);
            toolRenderer = tool.GetComponent<Renderer>(); toolRenderer.sharedMaterial = toolMaterial;
            toolRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; tool.SetActive(false);
        }

        public void Stop()
        {
            if (client?.Socket?.Connected == true && client.Me != null && !client.Me.Flag("observer"))
                client.Send(new JObject { ["type"] = "input", ["x"] = 0, ["z"] = 0, ["sprint"] = false, ["yaw"] = yaw * Mathf.Deg2Rad });
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape) && client.Map != null) client.ToggleMenu();
            if (client.Map == null) { cameraPlaced = false; tool.SetActive(false); return; }
            if (client.MenuOpen || client.Result != null) return;
            if (Cursor.lockState != CursorLockMode.Locked)
            { if (Input.GetMouseButtonDown(0)) client.SetCursor(true); return; }
            yaw += Input.GetAxisRaw("Mouse X") * 2;
            pitch = Mathf.Clamp(pitch - Input.GetAxisRaw("Mouse Y") * 2, -65, 75);
            if (Input.GetKeyDown(KeyCode.V)) FirstPerson = !FirstPerson;
            var me = client.Me;
            if (me == null || me.Flag("observer")) { Observe(); return; }
            if (!me.Flag("alive") && !me.Flag("ghost")) return;
            Vector3 local = new Vector3((Input.GetKey(KeyCode.D) ? 1 : 0) - (Input.GetKey(KeyCode.A) ? 1 : 0), 0,
                (Input.GetKey(KeyCode.W) ? 1 : 0) - (Input.GetKey(KeyCode.S) ? 1 : 0));
            Vector3 move = Quaternion.Euler(0, yaw, 0) * local.normalized;
            if (Time.unscaledTime >= nextInput)
            {
                nextInput = Time.unscaledTime + .05f;
                client.Send(new JObject { ["type"] = "input", ["x"] = move.x, ["z"] = move.z,
                    ["sprint"] = Input.GetKey(KeyCode.LeftShift), ["yaw"] = yaw * Mathf.Deg2Rad });
            }
            if (Input.GetKeyDown(KeyCode.G)) { client.ToggleMenu(); return; }
            Aim(out var target, out var point);
            if (target != null) SelectedId = target.Id;
            if (me.Text("role") == "troll") Troll(me);
            else Elf(me, target, point);
        }

        void Aim(out EntityTag entity, out Vector3 point)
        {
            entity = null; point = cameraView.transform.position + cameraView.transform.forward * 10;
            if (!Physics.Raycast(cameraView.ViewportPointToRay(new Vector3(.5f, .5f)), out var hit, 150)) return;
            point = hit.point; entity = hit.collider.GetComponentInParent<EntityTag>();
            if (entity?.Id == client.ViewerId) entity = null;
        }

        void Troll(JObject me)
        {
            var choices = me.Rows("cardOffer");
            if (choices.Count > 0)
            {
                for (int i = 0; i < Mathf.Min(3, choices.Count); i++) if (Input.GetKeyDown((KeyCode)((int)KeyCode.Alpha1 + i)))
                    client.Action("selectCard", null, new JObject { ["card"] = (string)choices[i] });
            }
            if (Time.unscaledTime >= nextInteraction && (Input.GetMouseButton(0) || Input.GetMouseButtonDown(1)))
            {
                nextInteraction = Time.unscaledTime + .15f;
                client.Action("attack", null, new JObject { ["heavy"] = Input.GetMouseButtonDown(1), ["yaw"] = yaw * Mathf.Deg2Rad });
            }
            if (Input.GetKeyDown(KeyCode.Q)) client.Action("heal");
            if (Input.GetKeyDown(KeyCode.E)) client.Action("roar");
            if (Input.GetKeyDown(KeyCode.B)) client.Action("trollRecall");
            if (Input.GetKeyDown(KeyCode.Space)) client.Action("dash", null, new JObject { ["yaw"] = yaw * Mathf.Deg2Rad });
        }

        void Elf(JObject me, EntityTag target, Vector3 point)
        {
            if (Input.GetKeyDown(KeyCode.Alpha1)) client.Action("equipRod");
            if (Input.GetKeyDown(KeyCode.F)) client.Action("elfStun");
            if (Input.GetKeyDown(KeyCode.E)) client.Action("elfSpecializationAbility");
            string[] kinds = { "wall", "tower", "mine", "fishery", "core" };
            for (int i = 0; i < kinds.Length; i++) if (Input.GetKeyDown((KeyCode)((int)KeyCode.Alpha2 + i)))
            {
                JObject owned = null;
                foreach (JObject structure in client.Snapshots.State.Rows("structures"))
                    if (structure.Text("kind") == kinds[i] && structure.Text("owner") == client.ViewerId) { owned = structure; break; }
                if (owned != null && kinds[i] != "fishery" && !Input.GetKey(KeyCode.LeftShift))
                    client.Action("upgrade", owned.Text("id"), new JObject { ["remote"] = true });
                else buildKind = kinds[i];
            }
            if (Input.GetMouseButtonDown(1)) { buildKind = null; client.Action("cancelFishing"); return; }
            if (buildKind != null && Input.GetMouseButtonDown(0))
            {
                float rotation = 0;
                if (buildKind == "wall")
                {
                    JObject closest = null; float best = float.MaxValue;
                    foreach (JObject b in client.Map.Rows("bases"))
                    { float distance = Vector3.Distance(b["gate"].Position(point.y), point); if (distance < best) { best = distance; closest = b; } }
                    if (closest != null) { point = closest["gate"].Position(); rotation = closest["gate"].Text("axis") == "x" ? Mathf.PI / 2 : 0; }
                }
                client.Action("build", null, new JObject { ["kind"] = buildKind, ["x"] = point.x, ["z"] = point.z, ["rotation"] = rotation });
                buildKind = null; return;
            }
            if (me.Flag("rodEquipped"))
            {
                if (Input.GetMouseButtonDown(0)) client.Action(me["fishing"].Text("phase") == "bite" ? "hookFish" : "castLine");
                return;
            }
            if (target == null || !Input.GetMouseButton(0) || Time.unscaledTime < nextInteraction) return;
            nextInteraction = Time.unscaledTime + .2f;
            string action = target.Kind == "tree" ? "gather" : target.Kind == "crystal" ? "gatherSpecial" : "repair";
            var s = client.Snapshots.Entity("structures", target.Id);
            if (s != null && s.Number("progress", 1) < 1) action = "assist";
            client.Action(action, target.Id);
        }

        void Observe()
        {
            if (Input.GetKeyDown(KeyCode.Tab))
            {
                var units = client.Snapshots.State.Rows("units"); followIndex = (followIndex + 1) % (units.Count + 1);
                followId = followIndex == 0 ? null : units[followIndex - 1].Text("id");
            }
            if (followId != null) return;
            var rotation = Quaternion.Euler(pitch, yaw, 0);
            float step = (Input.GetKey(KeyCode.LeftShift) ? 35 : 15) * Time.unscaledDeltaTime;
            freePosition += rotation * new Vector3((Input.GetKey(KeyCode.D) ? 1 : 0) - (Input.GetKey(KeyCode.A) ? 1 : 0), 0,
                (Input.GetKey(KeyCode.W) ? 1 : 0) - (Input.GetKey(KeyCode.S) ? 1 : 0)) * step;
            freePosition.y += ((Input.GetKey(KeyCode.Space) ? 1 : 0) - (Input.GetKey(KeyCode.LeftControl) ? 1 : 0)) * step;
        }

        void LateUpdate()
        {
            if (client.Map == null) return;
            var me = client.Me; bool observing = me == null || me.Flag("observer");
            if (!cameraPlaced)
            { float middle = client.Map.Number("size") * client.Map.Number("cell") / 2; freePosition = new Vector3(middle, client.World.Height(middle, middle) + 20, middle); cameraPlaced = true; }
            var anchor = client.World.EntityTransform(observing ? followId : client.ViewerId);
            var rotation = Quaternion.Euler(pitch, yaw, 0);
            cameraView.transform.rotation = rotation;
            if (anchor == null) cameraView.transform.position = freePosition;
            else
            {
                float eye = me.Text("role") == "troll" ? 2.8f : 1.75f;
                var focus = anchor.position + Vector3.up * eye;
                cameraView.transform.position = FirstPerson && !observing ? focus : focus - rotation * Vector3.forward * 7 + Vector3.up;
            }
            bool show = !observing && FirstPerson && !client.MenuOpen && me.Flag("alive"); tool.SetActive(show);
            if (!show) return;
            float swing = client.World.AttackSwing(client.ViewerId);
            if (me.Text("action") == "repair" || me.Text("action") == "gather") swing = Mathf.Sin((float)client.RenderTime * 12);
            tool.transform.localPosition = new Vector3(.35f - swing * .18f, -.3f + swing * .1f, .65f);
            tool.transform.localRotation = Quaternion.Euler(20 - swing * 70, -15 + swing * 35, 15);
            tool.transform.localScale = me.Flag("rodEquipped") ? new Vector3(.035f, .035f, 1.25f) : new Vector3(.14f, .14f, .65f);
        }

        void OnDestroy() { if (toolMaterial != null) Destroy(toolMaterial); }
    }
}
