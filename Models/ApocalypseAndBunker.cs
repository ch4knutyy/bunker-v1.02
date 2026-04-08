namespace Bunker.Models
{
    /// <summary>
    /// Апокаліпсис - глобальна катастрофа
    /// </summary>
    public class Apocalypse
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Severity { get; set; } = "medium"; // low, medium, high, extreme
        public int SurvivalChance { get; set; } = 50; // Шанс виживання у %
        public string Duration { get; set; } = ""; // Тривалість перебування в бункері
        public List<string> Threats { get; set; } = new(); // Загрози зовні
        public List<string> Requirements { get; set; } = new(); // Що потрібно для виживання

        public object ToClientInfo()
        {
            return new
            {
                id = Id,
                name = Name,
                description = Description,
                severity = Severity,
                survivalChance = SurvivalChance,
                duration = Duration,
                threats = Threats,
                requirements = Requirements
            };
        }
    }

    /// <summary>
    /// Бункер - укриття для виживання
    /// </summary>
    public class BunkerInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public int Capacity { get; set; } = 6; // Максимальна кількість людей
        public string Location { get; set; } = "";
        public int SuppliesMonths { get; set; } = 12; // Запаси на місяців
        public List<string> Facilities { get; set; } = new(); // Доступні приміщення
        public List<string> Resources { get; set; } = new(); // Наявні ресурси
        public List<string> Problems { get; set; } = new(); // Проблеми бункера
        public string Condition { get; set; } = "good"; // poor, fair, good, excellent

        public object ToClientInfo()
        {
            return new
            {
                id = Id,
                name = Name,
                description = Description,
                capacity = Capacity,
                location = Location,
                suppliesMonths = SuppliesMonths,
                facilities = Facilities,
                resources = Resources,
                problems = Problems,
                condition = Condition
            };
        }
    }

    /// <summary>
    /// Кореневі об'єкти для JSON
    /// </summary>
    public class ApocalypsesRoot
    {
        public List<Apocalypse> Apocalypses { get; set; } = new();
    }

    public class BunkersRoot
    {
        public List<BunkerInfo> Bunkers { get; set; } = new();
    }
}
