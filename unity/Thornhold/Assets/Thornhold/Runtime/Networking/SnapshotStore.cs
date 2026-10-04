using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace Thornhold.Networking
{
    // Mirrors shared/snapshot-delta.js. Presentation only: never computes damage,
    // income, progression or visibility. Removing an entity also removes its view.
    public sealed class SnapshotStore
    {
        public JObject State { get; private set; }
        public long Sequence { get; private set; }

        public void Reset() { State = null; Sequence = 0; }

        public void Full(JObject snapshot, long sequence)
        {
            if (snapshot == null || sequence < 1) throw new ArgumentException("Invalid full snapshot.");
            State = (JObject)snapshot.DeepClone();
            Sequence = sequence;
        }

        public void Delta(JObject delta)
        {
            long sequence = (long?)delta?["seq"] ?? 0;
            if (State == null || sequence != Sequence + 1)
                throw new InvalidOperationException("Snapshot sequence gap; reconnect for a full snapshot.");
            // Validate the complete patch before mutating the last valid state.
            var collections = delta["collections"] as JObject ?? new JObject();
            foreach (var property in collections.Properties())
            {
                var change = (JObject)property.Value;
                var ids = new HashSet<string>();
                foreach (JObject item in State[property.Name] as JArray ?? new JArray()) ids.Add((string)item["id"]);
                foreach (var id in change["remove"] as JArray ?? new JArray()) ids.Remove((string)id);
                foreach (JObject item in change["add"] as JArray ?? new JArray())
                    if (String.IsNullOrEmpty((string)item["id"]) || !ids.Add((string)item["id"]))
                        throw new InvalidOperationException("Invalid collection addition.");
                foreach (JObject patch in change["patch"] as JArray ?? new JArray())
                    if (!ids.Contains((string)patch["id"])) throw new InvalidOperationException("Unknown patched entity.");
                var order = change["order"] as JArray;
                if (order != null)
                {
                    var ordered = new HashSet<string>();
                    foreach (var id in order) if (!ids.Contains((string)id) || !ordered.Add((string)id))
                        throw new InvalidOperationException("Invalid collection order.");
                    if (ordered.Count != ids.Count) throw new InvalidOperationException("Incomplete collection order.");
                }
            }
            SetUnset(State, delta);
            foreach (var property in collections.Properties())
            {
                var current = State[property.Name] as JArray ?? new JArray();
                var byId = new Dictionary<string, JObject>();
                var order = new List<string>();
                foreach (JObject item in current) { string id = (string)item["id"]; byId[id] = item; order.Add(id); }
                var change = (JObject)property.Value;
                foreach (var value in change["remove"] as JArray ?? new JArray()) { string id = (string)value; byId.Remove(id); order.Remove(id); }
                foreach (JObject item in change["add"] as JArray ?? new JArray()) { string id = (string)item["id"]; byId[id] = (JObject)item.DeepClone(); order.Add(id); }
                foreach (JObject patch in change["patch"] as JArray ?? new JArray()) SetUnset(byId[(string)patch["id"]], patch);
                if (change["order"] is JArray explicitOrder) { order.Clear(); foreach (var id in explicitOrder) order.Add((string)id); }
                var result = new JArray();
                foreach (string id in order) result.Add(byId[id]);
                State[property.Name] = result;
            }
            Sequence = sequence;
        }

        static void SetUnset(JObject target, JObject change)
        {
            if (change["set"] is JObject set) foreach (var property in set.Properties()) target[property.Name] = property.Value.DeepClone();
            if (change["unset"] is JArray unset) foreach (var key in unset) target.Remove((string)key);
        }

        public JObject Entity(string collection, string id)
        {
            foreach (JObject item in State?[collection] as JArray ?? new JArray()) if ((string)item["id"] == id) return item;
            return null;
        }
    }
}
