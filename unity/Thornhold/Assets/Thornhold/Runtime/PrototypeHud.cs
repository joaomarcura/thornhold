using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Thornhold
{
    // Temporary integration HUD. Replace with retained UI after the network slice is validated.
    public sealed class PrototypeHud : MonoBehaviour
    {
        ThornholdClient client;
        Vector2 scroll;
        float fps, measuredAt;
        int frames;
        void Awake() { client = GetComponent<ThornholdClient>(); }
        void Update()
        {
            frames++;
            if (Time.unscaledTime - measuredAt < .5f) return;
            fps = frames / Mathf.Max(.001f, Time.unscaledTime - measuredAt); frames = 0; measuredAt = Time.unscaledTime;
        }
        bool Button(string label) => GUILayout.Button(label, GUILayout.MinHeight(28));
        void OnGUI()
        {
            GUILayout.BeginArea(new Rect(16, 12, Mathf.Min(750, Screen.width - 32), 100), GUI.skin.box);
            GUILayout.Label($"THORNHOLD · Unity native prototype · {fps:0} FPS · {client.PingMs:0} ms");
            GUILayout.Label(client.Status);
            if (client.Map != null) GUILayout.Label($"Tempo {TimeSpan.FromSeconds(Math.Max(0, client.RenderTime)):mm\\:ss} · ESC/G menu · V câmera");
            GUILayout.EndArea();
            if (client.Map != null) MatchHud();
            if (!client.MenuOpen && client.Map != null) return;
            GUILayout.BeginArea(new Rect(16, 120, Mathf.Min(680, Screen.width - 32), Mathf.Max(150, Screen.height - 145)), GUI.skin.box);
            scroll = GUILayout.BeginScrollView(scroll);
            if (client.Result != null) Result();
            else if (client.Map != null) InGameMenu();
            else if (client.Room != null) Lobby();
            else Connection();
            GUILayout.EndScrollView(); GUILayout.EndArea();
        }

        void Connection()
        {
            GUILayout.Label("Primeiro corte: servidor Node autoritativo + cliente Unity. Arte e menus provisórios.");
            GUILayout.Label("Servidor (ws://localhost:3000 para local; wss:// para remoto)");
            client.Address = GUILayout.TextField(client.Address);
            GUILayout.Label("Nome"); client.PlayerName = GUILayout.TextField(client.PlayerName);
            if (Button("Conectar")) client.Connect();
            GUI.enabled = client.ClientId != null && client.Socket?.Connected == true;
            string[] roles = { "elf", "troll", "observer" };
            GUILayout.BeginHorizontal(); foreach (string role in roles) if (Button((client.Role == role ? "✓ " : "") + role)) client.Role = role; GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal(); foreach (string difficulty in new[] { "easy", "normal", "hard" }) if (Button((client.Difficulty == difficulty ? "✓ " : "") + difficulty)) client.Difficulty = difficulty; GUILayout.EndHorizontal();
            if (Button("Criar sala 1 Troll × 5 Elfos (preencher com bots)")) client.CreateRoom();
            if (Button("Criar co-op com parceiro bot (normal)")) client.CreateRoom(true);
            GUILayout.Label("Código de uma sala existente"); client.JoinCode = GUILayout.TextField(client.JoinCode);
            if (Button("Entrar")) client.Send(new JObject { ["type"] = "join", ["code"] = client.JoinCode.Trim().ToUpperInvariant() });
            GUI.enabled = true;
        }

        void Lobby()
        {
            GUILayout.Label("Sala " + client.Room.Text("id") + " · " + client.Room.Text("name"));
            foreach (JObject slot in client.Room.Rows("slots"))
                GUILayout.Label(slot.Text("role") + " · " + slot["occupant"].Text("name", "Vazio") + (slot["occupant"].Flag("ready") ? " · pronto" : ""));
            foreach (var error in client.Room.Rows("errors")) GUILayout.Label("Aguardando: " + error);
            if (Button("Estou pronto")) client.Send(new JObject { ["type"] = "ready", ["ready"] = true });
            GUI.enabled = client.Room.Text("hostId") == client.ClientId && client.Room.Rows("errors").Count == 0;
            if (Button("Iniciar partida")) client.Send(JsonData.Message("start"));
            GUI.enabled = true;
            if (Button("Sair da sala")) client.Send(JsonData.Message("leave"));
        }

        void MatchHud()
        {
            var me = client.Me;
            GUILayout.BeginArea(new Rect(16, Screen.height - 135, Mathf.Min(830, Screen.width - 32), 120), GUI.skin.box);
            if (me != null)
            {
                GUILayout.Label($"{me.Text("name")} · HP {me.Number("hp"):0}/{me.Number("maxHp"):0} · Ouro {me.Number("gold"):0} · Madeira {me.Number("wood"):0} · Cristal {me["specialResources"].Number("crystal"):0}");
                if (me.Text("role") == "elf")
                {
                    GUILayout.Label("1 ferramenta · 2 barricada · 3 torre · 4 mina · 5 oficina · 6 núcleo · Shift+número nova construção · clique coloca · direito cancela");
                    GUILayout.Label("Segure clique: coletar/reparar · F stun · E especialização · G vender/evoluir equipamento · números evoluem prédios existentes à distância");
                    foreach (JObject structure in client.Snapshots.State.Rows("structures")) if (structure.Text("owner") == me.Text("id") && structure.Text("kind") == "wall") GUILayout.Label($"Barricada Nv.{structure.Number("tier"):0}: {structure.Number("hp"):0}/{structure.Number("maxHp"):0}");
                    if (client.Controls.BuildKind != null) GUILayout.Label("Posicionando " + client.Controls.BuildKind + " na mira (validação no servidor)");
                    if (me.Flag("rodEquipped")) GUILayout.Label("Vara · " + me["fishing"].Text("phase", me["fishingStatus"].Text("reason")));
                }
                else
                {
                    GUILayout.Label("Clique ataque · direito pesado · Espaço esquiva · Q cura · E rugido · B recall · G loja");
                    int n = 1; foreach (var choice in me.Rows("cardOffer")) GUILayout.Label($"{n++}: {client.Contract["cards"][(string)choice].Text("name")} (carta disponível)");
                }
            }
            else GUILayout.Label("Observador: WASD voo · Espaço sobe · Ctrl desce · Shift rápido · Tab alterna personagens/voo livre");
            GUILayout.EndArea();
            if (!client.MenuOpen) GUI.Label(new Rect(Screen.width / 2 - 5, Screen.height / 2 - 10, 20, 20), "+");
            if (client.World.CatchVisible)
            {
                var fish = client.World.LastCatch;
                GUI.Box(new Rect(Screen.width / 2 - 210, Screen.height / 2 + 60, 420, 90), $"{fish.Text("name")} · {fish.Text("rarity")} {(fish.Flag("shiny") ? "SHINY" : "")}\n{fish.Number("weight"):0.00} kg · Rating {fish.Number("rating"):0}/100\nValor {fish.Number("saleValue"):0} ouro");
            }
        }

        void InGameMenu()
        {
            if (Button("Voltar ao jogo / capturar mouse")) client.ToggleMenu();
            var me = client.Me;
            if (me == null)
            {
                if (client.DevMode)
                { GUILayout.Label("Velocidade DEV (autorização confirmada pelo servidor)"); GUILayout.BeginHorizontal(); foreach (int speed in new[] { 1, 2, 4, 8, 16 }) if (Button(speed + "×")) client.Send(new JObject { ["type"] = "dev", ["command"] = "speed", ["speed"] = speed }); GUILayout.EndHorizontal(); }
            }
            else if (me.Text("role") == "elf") ElfMenu(me);
            else TrollMenu(me);
            if (Button("Encerrar / sair da partida")) client.Send(JsonData.Message("leave"));
        }

        void ElfMenu(JObject me)
        {
            GUILayout.Label("Oficina — aproxime-se da sua Oficina para vender/aprimorar (vara pode continuar equipada)");
            GUILayout.Label(me["fishingWorkshop"].Text("reason"));
            GUI.enabled = me["fishingWorkshop"].Flag("available");
            if (Button("Vender todos os peixes")) client.Action("sellFish", null, new JObject { ["ids"] = "all" });
            foreach (string gear in new[] { "rod", "bait", "reel" })
            {
                var equipment = me["fishingEquipment"]?[gear]; var cost = equipment?["nextCost"];
                if (cost != null && cost.Type != JTokenType.Null && Button($"{client.Contract["fishingGear"][gear].Text("name")} Nv.{equipment.Number("level"):0} → próximo · {cost.Number("gold"):0} ouro / {cost.Number("wood"):0} madeira"))
                    client.Action("upgradeFishingGear", null, new JObject { ["key"] = gear });
            }
            GUI.enabled = true;
            var inventory = new List<JObject>(); foreach (JObject fish in me.Rows("fishInventory")) inventory.Add(fish);
            string[] rarity = { "common", "uncommon", "rare", "epic", "legendary", "mythic" };
            inventory.Sort((a, b) => Array.IndexOf(rarity, b.Text("rarity")).CompareTo(Array.IndexOf(rarity, a.Text("rarity"))));
            foreach (var fish in inventory) GUILayout.Label($"{fish.Text("rarity")} · {fish.Text("name")} · {fish.Number("rating"):0} · {fish.Number("saleValue"):0} ouro");
            GUILayout.Label("Construções próprias — custos/requisitos são aplicados pelo servidor");
            foreach (JObject s in client.Snapshots.State.Rows("structures"))
            {
                if (s.Text("owner") != me.Text("id")) continue;
                GUILayout.Label($"{s.Text("kind")} Nv.{s.Number("tier"):0} · {s.Number("hp"):0}/{s.Number("maxHp"):0}");
                if (s.Text("kind") == "fishery") continue;
                if (Button("Evoluir " + s.Text("kind") + " à distância")) client.Action("upgrade", s.Text("id"), new JObject { ["remote"] = true });
                if (s["specialization"]?.Type == JTokenType.Object) continue;
                foreach (JObject choice in client.Contract["specializations"].Rows(s.Text("kind")))
                    if (Button("Especializar: " + choice.Text("name"))) client.Action("specializeStructure", s.Text("id"), new JObject { ["key"] = choice.Text("id"), ["remote"] = true });
            }
            if (Button("Treinar Wisp")) client.Action("trainWisp");
        }

        void TrollMenu(JObject me)
        {
            GUILayout.Label("Forja — compras somente na base, conforme regra atual do servidor");
            var upgrades = (JObject)client.Contract["balance"]["upgrades"];
            foreach (var property in upgrades.Properties())
            {
                int level = (int)me["levels"].Number(property.Name); var definition = property.Value;
                double cost = Math.Round(definition.Number("cost") * Math.Pow(definition.Number("growth"), level));
                if (Button($"{definition.Text("name")} Nv.{level} · {cost:0} ouro")) client.Action("buy", null, new JObject { ["key"] = property.Name });
            }
            foreach (var item in ((JObject)client.Contract["items"]).Properties())
            {
                bool owned = false; foreach (var id in me.Rows("inventory")) if ((string)id == item.Name) owned = true;
                if (Button(item.Value.Text("name") + (owned ? " · equipar" : $" · {item.Value.Number("cost"):0} ouro")))
                    client.Action(owned ? "equipItem" : "buyItem", null, new JObject { ["item"] = item.Name });
                if (owned && Button("Evoluir " + item.Value.Text("name"))) client.Action("upgradeItem", null, new JObject { ["item"] = item.Name });
            }
            foreach (var id in me.Rows("cardOffer")) if (Button("Escolher carta: " + client.Contract["cards"][(string)id].Text("name"))) client.Action("selectCard", null, new JObject { ["card"] = (string)id });
        }

        void Result()
        {
            GUILayout.Label("Resultado autoritativo · " + client.Result.Text("winner"));
            GUILayout.Label("Duração " + client.Result.Number("duration") + " segundos");
            if (Button("Voltar ao lobby")) client.Send(JsonData.Message("return"));
            if (Button("Sair")) client.Send(JsonData.Message("leave"));
        }
    }
}
