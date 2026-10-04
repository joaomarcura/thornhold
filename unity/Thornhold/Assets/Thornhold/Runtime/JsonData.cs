using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Thornhold
{
    public static class JsonData
    {
        static readonly JArray Empty = new JArray();
        public static float Number(this JToken token, string key, float fallback = 0) => (float?)(token as JObject)?[key] ?? fallback;
        public static bool Flag(this JToken token, string key) => (bool?)(token as JObject)?[key] ?? false;
        public static string Text(this JToken token, string key, string fallback = "") => (string)(token as JObject)?[key] ?? fallback;
        public static Vector3 Position(this JToken token, float y = 0) => new Vector3(token.Number("x"), y, token.Number("z"));
        public static JArray Rows(this JToken token, string key) => (token as JObject)?[key] as JArray ?? Empty;
        public static JObject Message(string type) => new JObject { ["type"] = type };
        public static bool HasObject(JToken value) => value != null && value.Type == JTokenType.Object;
    }
}
