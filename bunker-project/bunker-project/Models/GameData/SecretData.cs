using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class SecretData
    {
        [JsonPropertyName("secret")]
        public string Secret { get; set; } = "";
        
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";
        
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";
    }

    public class SecretsRoot
    {
        [JsonPropertyName("secrets")]
        public List<SecretData> Secrets { get; set; } = new();
    }
}
