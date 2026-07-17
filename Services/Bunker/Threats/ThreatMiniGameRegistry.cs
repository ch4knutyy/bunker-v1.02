namespace Bunker.Services.Threats
{
    public sealed class ThreatMiniGameRegistry
    {
        private readonly Dictionary<string, IThreatMiniGameService> _services;

        public ThreatMiniGameRegistry(IEnumerable<IThreatMiniGameService> services)
        {
            _services = services.ToDictionary(service => service.ThreatId, StringComparer.OrdinalIgnoreCase);
        }

        public bool TryGet(string threatId, out IThreatMiniGameService service) =>
            _services.TryGetValue(threatId, out service!);
    }
}
