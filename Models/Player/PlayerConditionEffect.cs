namespace Bunker.Models
{
    public class PlayerConditionEffect
    {
        public string Id { get; set; } = "";
        public string ConditionId { get; set; } = "";
        public string BaseName { get; set; } = "";
        public string Name { get; set; } = "";
        public string SeverityCode { get; set; } = "";
        public string SeverityLevel { get; set; } = "";
        public string SourceThreatId { get; set; } = "";
        public int? AppliedAtRound { get; set; }
        public string Description { get; set; } = "";
        public Dictionary<string, GameData.ConditionLocalization>? Localization { get; set; }
    }
}
