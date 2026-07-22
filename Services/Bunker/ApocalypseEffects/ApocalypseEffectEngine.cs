using System.Text.Json;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;

namespace Bunker.Services;

public interface IApocalypseRandom
{
    int Next(int minValue, int maxValue);
}

public sealed class SystemApocalypseRandom : IApocalypseRandom
{
    public int Next(int minValue, int maxValue) => Random.Shared.Next(minValue, maxValue);
}

public interface IApocalypseEffectHandler
{
    string EffectType { get; }
    void Validate(ApocalypseEffectDefinition effect);
    void Apply(ApocalypseEffectContext context, ApocalypseEffectDefinition effect);
}

public sealed class ApocalypseEffectHandlerRegistry
{
    private readonly IReadOnlyDictionary<string, IApocalypseEffectHandler> handlers;
    public IReadOnlyCollection<string> EffectTypes => handlers.Keys.ToArray();

    public ApocalypseEffectHandlerRegistry(GameDataService gameData, IApocalypseRandom random)
    {
        var created = ApocalypseEffectHandlers.Create(gameData, random);
        var duplicates = created.GroupBy(item => item.EffectType, StringComparer.OrdinalIgnoreCase).Where(group => group.Count() > 1).Select(group => group.Key).ToList();
        if (duplicates.Count > 0) throw new InvalidOperationException($"Duplicate apocalypse effect handlers: {string.Join(", ", duplicates)}");
        handlers = created.ToDictionary(item => item.EffectType, StringComparer.OrdinalIgnoreCase);
        var production = gameData.ApocalypseInteractiveSchema?.EffectTypesUsed ?? [];
        var missing = production.Where(type => !handlers.ContainsKey(type)).ToList();
        if (missing.Count > 0) throw new InvalidOperationException($"Missing apocalypse effect handlers: {string.Join(", ", missing)}");
        foreach (var apocalypse in gameData.GetInteractiveApocalypses())
            foreach (var effect in apocalypse.Gameplay?.Effects ?? [])
            {
                if (!handlers.TryGetValue(effect.Type, out var handler)) throw new InvalidOperationException($"Unsupported production effect '{effect.Type}'");
                handler.Validate(effect);
            }
    }

    public IApocalypseEffectHandler Get(string effectType) => handlers.TryGetValue(effectType, out var handler)
        ? handler : throw new InvalidDataException($"apocalypse_effect_handler_missing:{effectType}");
}

public sealed class ApocalypseEffectContext
{
    private readonly Dictionary<string, HashSet<string>> changedFields = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<ApocalypseEffectPersonalChange>> personal = new(StringComparer.OrdinalIgnoreCase);
    public Room Room { get; }
    public GameDataService GameData { get; }
    public IApocalypseRandom Random { get; }
    public IReadOnlyDictionary<string, (int Height, int Weight)> BodyBaselines { get; }
    public IReadOnlyDictionary<string, Player> Players { get; }
    public IReadOnlyCollection<string> AffectedPlayerIds => changedFields.Keys;
    public IReadOnlyDictionary<string, IReadOnlyList<ApocalypseEffectPersonalChange>> PersonalChanges =>
        personal.ToDictionary(entry => entry.Key, entry => (IReadOnlyList<ApocalypseEffectPersonalChange>)entry.Value.AsReadOnly(), StringComparer.OrdinalIgnoreCase);

    public ApocalypseEffectContext(Room room, GameDataService gameData, IApocalypseRandom random)
    {
        Room = room; GameData = gameData; Random = random;
        Players = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)
            .GroupBy(RoomService.GetPlayerKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        BodyBaselines = Players.ToDictionary(entry => entry.Key, entry => (entry.Value.Body?.Height ?? 0, entry.Value.Body?.Weight ?? 0), StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyList<Player> Targets(bool includeEliminated) => Players.Values
        .Where(RoomService.IsGameplayParticipant)
        .Where(player => includeEliminated || !player.IsEliminated)
        .OrderBy(RoomService.GetPlayerKey, StringComparer.OrdinalIgnoreCase).ToList();

    public void Changed(Player player, string field, string before, string after)
    {
        var id = RoomService.GetPlayerKey(player);
        if (!changedFields.TryGetValue(id, out var fields)) changedFields[id] = fields = new(StringComparer.OrdinalIgnoreCase);
        fields.Add(field);
        if (!personal.TryGetValue(id, out var changes)) personal[id] = changes = [];
        changes.Add(new(field, before, after));
    }

    public void RefreshRevealedValues()
    {
        foreach (var entry in changedFields)
        {
            var player = Players[entry.Key];
            foreach (var field in entry.Value)
            {
                if (!IsRevealed(player, field) || !player.Revealed.RevealedValues.TryGetValue(field, out var revealed)) continue;
                revealed.Value = Display(player, field);
            }
        }
    }

    private static bool IsRevealed(Player player, string field) => field switch
    {
        "Personality" => player.Revealed.Personality, "Body" => player.Revealed.Body, "Profession" => player.Revealed.Profession,
        "PhysicalHealth" => player.Revealed.PhysicalHealth, "MentalHealth" => player.Revealed.MentalHealth,
        "Hobby" => player.Revealed.Hobby, "CharacterTrait" => player.Revealed.CharacterTrait,
        "Phobia" => player.Revealed.Phobia, "Fact" => player.Revealed.Fact, "Inventory" => player.Revealed.Inventory,
        "Property" => player.Revealed.Property, _ => false
    };
    private static string Display(Player player, string field) => field switch
    {
        "Personality" => player.Personality.Age.ToString(), "Body" => $"{player.Body.Height} см, {player.Body.Weight} кг, {player.Body.BodyType}",
        "Profession" => player.ApocalypseProfessionSuppression?.IsSuppressed == true ? "Професійні навички втрачені" : player.Profession.Name,
        "PhysicalHealth" => player.PhysicalHealth.Name, "MentalHealth" => player.MentalHealth.Name,
        "Hobby" => player.Hobby.Name, "CharacterTrait" => player.CharacterTrait.Name, "Phobia" => player.Phobia.Name,
        "Fact" => player.Fact.Name, "Inventory" => string.Join(", ", player.Inventory.Items.Select(item => item.Name)),
        "Property" => player.Property?.GetDisplayText("uk") ?? "", _ => ""
    };
}

public sealed class ApocalypseEffectEngine(ApocalypseEffectHandlerRegistry registry, GameDataService gameData, IApocalypseRandom random)
{
    public ApocalypseEffectExecutionResult Execute(Room room, Apocalypse apocalypse)
    {
        var effects = apocalypse.Gameplay?.Effects ?? [];
        var effectTypes = effects.Select(effect => effect.Type).ToList().AsReadOnly();
        try
        {
            foreach (var effect in effects) registry.Get(effect.Type).Validate(effect);
        }
        catch (Exception exception)
        {
            return Failure(effectTypes, "apocalypse_effect_payload_invalid", exception);
        }

        var snapshots = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)
            .Distinct().ToDictionary(RoomService.GetPlayerKey, PlayerMutationSnapshot.Capture, StringComparer.OrdinalIgnoreCase);
        var context = new ApocalypseEffectContext(room, gameData, random);
        try
        {
            foreach (var effect in effects) registry.Get(effect.Type).Apply(context, effect);
            context.RefreshRevealedValues();
            return new(true, null, context.AffectedPlayerIds.Count, effectTypes,
                PublicSummary(effectTypes), context.PersonalChanges);
        }
        catch (Exception exception)
        {
            foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value).Distinct())
                if (snapshots.TryGetValue(RoomService.GetPlayerKey(player), out var snapshot)) snapshot.Restore(player);
            return Failure(effectTypes, "apocalypse_effect_execution_failed", exception);
        }
    }

    private static ApocalypseEffectExecutionResult Failure(IReadOnlyList<string> types, string code, Exception _) =>
        new(false, code, 0, types, "apocalypse_effect_failed", new Dictionary<string, IReadOnlyList<ApocalypseEffectPersonalChange>>());
    private static string PublicSummary(IReadOnlyList<string> types) => types.Any(type => type.Contains("age", StringComparison.OrdinalIgnoreCase)) ? "apocalypse_effect_age" :
        types.Any(type => type.Contains("body", StringComparison.OrdinalIgnoreCase) || type.Contains("height", StringComparison.OrdinalIgnoreCase) || type.Contains("weight", StringComparison.OrdinalIgnoreCase)) ? "apocalypse_effect_body" :
        types.Any(type => type.Contains("profession", StringComparison.OrdinalIgnoreCase)) ? "apocalypse_effect_profession" : "apocalypse_effect_conditions";
}

internal sealed class PlayerMutationSnapshot
{
    private readonly Player clone;
    private PlayerMutationSnapshot(Player clone) => this.clone = clone;
    public static PlayerMutationSnapshot Capture(Player player) => new(JsonSerializer.Deserialize<Player>(JsonSerializer.Serialize(player))!);
    public void Restore(Player player)
    {
        player.Personality = clone.Personality; player.Body = clone.Body; player.Profession = clone.Profession;
        player.ProfessionItem = clone.ProfessionItem; player.PhysicalHealth = clone.PhysicalHealth; player.MentalHealth = clone.MentalHealth;
        player.Hobby = clone.Hobby; player.CharacterTrait = clone.CharacterTrait; player.Phobia = clone.Phobia; player.Fact = clone.Fact;
        player.Inventory = clone.Inventory; player.Property = clone.Property; player.AdditionalConditionEffects = clone.AdditionalConditionEffects;
        player.ApocalypseProfessionSuppression = clone.ApocalypseProfessionSuppression; player.Revealed = clone.Revealed;
    }
}

internal static class ApocalypseEffectHandlers
{
    private static readonly string[] Types =
    [
        "set_all_player_age", "add_all_player_age", "multiply_all_player_weight", "set_all_player_body_type",
        "add_all_player_height", "multiply_all_player_height", "recalculate_weight_for_height", "reroll_all_player_body",
        "add_physical_condition_to_all", "decrease_all_professional_level", "suppress_profession_at_minimum_level",
        "replace_all_character_traits_with_opposites", "rotate_characteristic_bundle", "worsen_all_mental_health",
        "reroll_all_player_phobias", "add_random_allergy_to_all", "copy_random_characteristic_to_all",
        "degrade_random_owned_asset_for_all", "improve_all_physical_health", "swap_characteristic_bundle_between_random_players",
        "reroll_one_hidden_characteristic_for_all"
    ];

    public static IReadOnlyList<IApocalypseEffectHandler> Create(GameDataService data, IApocalypseRandom random) =>
        Types.Select(type => (IApocalypseEffectHandler)new DelegateHandler(type, effect => Validate(type, effect),
            (context, effect) => Apply(type, context, effect))).ToList().AsReadOnly();

    private sealed class DelegateHandler(string type, Action<ApocalypseEffectDefinition> validate,
        Action<ApocalypseEffectContext, ApocalypseEffectDefinition> apply) : IApocalypseEffectHandler
    {
        public string EffectType => type;
        public void Validate(ApocalypseEffectDefinition effect) => validate(effect);
        public void Apply(ApocalypseEffectContext context, ApocalypseEffectDefinition effect) => apply(context, effect);
    }

    private static void Validate(string type, ApocalypseEffectDefinition effect)
    {
        if (!string.Equals(type, effect.Type, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("effect_type_mismatch");
        bool Has(string key) => effect.Parameters.ContainsKey(key);
        var required = type switch
        {
            "set_all_player_age" or "add_all_player_age" or "add_all_player_height" => ["value"],
            "multiply_all_player_weight" or "multiply_all_player_height" => ["factor"],
            "set_all_player_body_type" => ["value"], "recalculate_weight_for_height" => ["mode"],
            "reroll_all_player_body" => ["heightRange", "weightRange"], "add_physical_condition_to_all" => ["conditionId", "severityStep"],
            "decrease_all_professional_level" => ["steps", "minimumLevel"], "suppress_profession_at_minimum_level" => ["replacementId"],
            "replace_all_character_traits_with_opposites" => ["fallback"], "rotate_characteristic_bundle" => ["keys", "direction"],
            "worsen_all_mental_health" => ["severityStep", "healthyFallbackConditionId"], "reroll_all_player_phobias" => ["excludeNoPhobia"],
            "add_random_allergy_to_all" => ["severity"], "copy_random_characteristic_to_all" or "reroll_one_hidden_characteristic_for_all" => ["allowedKeys"],
            "degrade_random_owned_asset_for_all" => ["scopes", "conditionSteps"], "improve_all_physical_health" => ["severityStep"],
            "swap_characteristic_bundle_between_random_players" => ["keys"], _ => Array.Empty<string>()
        };
        if (required.Any(key => !Has(key))) throw new InvalidDataException($"effect_payload_missing:{type}");
    }

    private static void Apply(string type, ApocalypseEffectContext context, ApocalypseEffectDefinition effect)
    {
        var p = effect.Parameters;
        var include = Bool(p, "includeEliminated");
        var targets = context.Targets(include);
        switch (type)
        {
            case "set_all_player_age": foreach (var player in targets) SetAge(context, player, Int(p,"value")); break;
            case "add_all_player_age": foreach (var player in targets) SetAge(context, player, player.Personality.Age + Int(p,"value"), Int(p,"minimum",8), Int(p,"maximum",120)); break;
            case "multiply_all_player_weight": foreach (var player in targets) SetWeight(context, player, Round(player.Body.Weight * Double(p,"factor")), Int(p,"minimumWeight",25), Int(p,"maximumWeight",350)); break;
            case "set_all_player_body_type": foreach (var player in targets) SetBodyType(context, player, ResolveBodyType(String(p,"value"))); break;
            case "add_all_player_height": foreach (var player in targets) SetHeight(context, player, player.Body.Height + Int(p,"value"), Int(p,"minimum",100), Int(p,"maximum",250)); break;
            case "multiply_all_player_height": foreach (var player in targets) SetHeight(context, player, Round(player.Body.Height * Double(p,"factor")), Int(p,"minimum",100), Int(p,"maximum",250)); break;
            case "recalculate_weight_for_height": foreach (var player in targets) RecalculateWeight(context, player, p); break;
            case "reroll_all_player_body": foreach (var player in targets) RerollBody(context, player, p); break;
            case "add_physical_condition_to_all": foreach (var player in targets) AddCondition(context, player, String(p,"conditionId"), Int(p,"severityStep",1)); break;
            case "decrease_all_professional_level": foreach (var player in targets) DecreaseProfession(context, player, Int(p,"steps",1), Int(p,"minimumLevel",0)); break;
            case "suppress_profession_at_minimum_level": foreach (var player in targets.Where(player => ProfessionIndex(player.Profession.ProfessionalLevel) == 0)) SuppressProfession(context, player, String(p,"replacementId")); break;
            case "replace_all_character_traits_with_opposites": foreach (var player in targets) ReplaceTrait(context, player); break;
            case "rotate_characteristic_bundle": RotateBodyHealth(context, targets); break;
            case "worsen_all_mental_health": foreach (var player in targets) WorsenMental(context, player, Int(p,"severityStep",1), String(p,"healthyFallbackConditionId")); break;
            case "reroll_all_player_phobias": foreach (var player in targets) RerollPhobia(context, player, Bool(p,"excludeNoPhobia"), Bool(p,"avoidCurrent")); break;
            case "add_random_allergy_to_all": foreach (var player in targets) AddAllergy(context, player, Bool(p,"avoidDuplicates",true), String(p,"severity")); break;
            case "copy_random_characteristic_to_all": CopyCharacteristic(context, targets, Strings(p,"allowedKeys"), Bool(p,"excludeSource",true)); break;
            case "degrade_random_owned_asset_for_all": foreach (var player in targets) DegradeAsset(context, player, Strings(p,"scopes"), Int(p,"conditionSteps",1), Bool(p,"skipDestroyed",true)); break;
            case "improve_all_physical_health": foreach (var player in targets) ImprovePhysical(context, player, Int(p,"severityStep",1)); break;
            case "swap_characteristic_bundle_between_random_players": SwapCharacteristics(context, targets, Strings(p,"keys")); break;
            case "reroll_one_hidden_characteristic_for_all": foreach (var player in targets) RerollHidden(context, player, Strings(p,"allowedKeys")); break;
            default: throw new InvalidDataException($"unsupported_effect:{type}");
        }
    }

    private static void SetAge(ApocalypseEffectContext c, Player p, int value, int min=8, int max=120) { var before=p.Personality.Age; p.Personality.Age=Math.Clamp(value,Math.Max(8,min),Math.Min(120,max)); c.Changed(p,"Personality",before.ToString(),p.Personality.Age.ToString()); }
    private static void SetWeight(ApocalypseEffectContext c, Player p, int value, int min=25, int max=350) { var before=p.Body.Weight; p.Body.Weight=Math.Clamp(value,Math.Max(25,min),Math.Min(350,max)); c.Changed(p,"Body",$"{before} кг",$"{p.Body.Weight} кг"); }
    private static void SetHeight(ApocalypseEffectContext c, Player p, int value, int min=100, int max=250) { var before=p.Body.Height; p.Body.Height=Math.Clamp(value,Math.Max(100,min),Math.Min(250,max)); c.Changed(p,"Body",$"{before} см",$"{p.Body.Height} см"); }
    private static void SetBodyType(ApocalypseEffectContext c, Player p, string value) { var before=p.Body.BodyType; p.Body.BodyType=value; c.Changed(p,"Body",before,value); }
    private static int Round(double value) { if (double.IsNaN(value)||double.IsInfinity(value)) throw new InvalidDataException("numeric_invalid"); return checked((int)Math.Round(value,MidpointRounding.AwayFromZero)); }
    private static string ResolveBodyType(string value) => value.Trim().ToLowerInvariant() switch { "дуже повна" => "Ожиріння (дуже важке)", "виснажена" => "Худий", "дуже м'язиста" or "дуже м’язиста" => "Підкачений", "квола" => "Худий", _ => throw new InvalidDataException("body_type_not_allowed") };
    private static void RecalculateWeight(ApocalypseEffectContext c, Player p, Dictionary<string,JsonElement> args) { if (!string.Equals(String(args,"mode"),"preserve_bmi",StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("bmi_mode_invalid"); var id=RoomService.GetPlayerKey(p); var baseline=c.BodyBaselines[id]; if(baseline.Height<=0) return; SetWeight(c,p,Round(baseline.Weight*Math.Pow((double)p.Body.Height/baseline.Height,2)),Int(args,"minimumWeight",25),Int(args,"maximumWeight",350)); }
    private static void RerollBody(ApocalypseEffectContext c, Player p, Dictionary<string,JsonElement> args) { var heights=Ints(args,"heightRange"); var weights=Ints(args,"weightRange"); var before=$"{p.Body.Height}/{p.Body.Weight}/{p.Body.BodyType}"; p.Body=new(){Height=c.Random.Next(heights[0],heights[1]+1),Weight=c.Random.Next(weights[0],weights[1]+1)}; p.Body.BodyType=BodyTypeFor(p.Body.Height,p.Body.Weight); c.Changed(p,"Body",before,$"{p.Body.Height}/{p.Body.Weight}/{p.Body.BodyType}"); }
    private static string BodyTypeFor(int height,int weight) { var bmi=weight/Math.Pow(height/100d,2); return bmi<18.5?"Худий":bmi<25?"Нормальний":bmi<30?"Підкачений":bmi<35?"Ожиріння (слабке)":bmi<40?"Ожиріння (середнє)":"Ожиріння (важке)"; }
    private static readonly string[] SeverityCodes=["light","medium","hard","veryHard","critical"];
    private static void AddCondition(ApocalypseEffectContext c, Player p, string id, int step) { var existing=p.AdditionalConditionEffects.FirstOrDefault(x=>string.Equals(x.ConditionId,id,StringComparison.OrdinalIgnoreCase)); var before=existing?.SeverityCode??"none"; if(existing==null){existing=new(){Id=$"apocalypse:{id}",ConditionId=id,BaseName=id,Name=id,SourceThreatId="apocalypse"};p.AdditionalConditionEffects.Add(existing);} var index=Math.Clamp(Array.FindIndex(SeverityCodes,x=>string.Equals(x,before,StringComparison.OrdinalIgnoreCase))+step,0,SeverityCodes.Length-1); existing.SeverityCode=SeverityCodes[index]; existing.SeverityLevel=SeverityHelper.GetSeverityName(SeverityHelper.GetSeverityLevelFromCode(existing.SeverityCode)); c.Changed(p,"PhysicalHealth",before,existing.SeverityCode); }
    private static readonly string[] ProfessionLevels=["Стажер","Початківець","Спеціаліст","Професіонал","Експерт","Майстер","Легенда професії"];
    private static int ProfessionIndex(string value) { var i=Array.FindIndex(ProfessionLevels,x=>string.Equals(x,value,StringComparison.OrdinalIgnoreCase)); return Math.Max(0,i); }
    private static void DecreaseProfession(ApocalypseEffectContext c, Player p, int steps,int minimum) { var before=p.Profession.ProfessionalLevel; var index=Math.Max(Math.Clamp(minimum,0,ProfessionLevels.Length-1),ProfessionIndex(before)-Math.Max(0,steps)); p.Profession.ProfessionalLevel=ProfessionLevels[index]; c.Changed(p,"Profession",before,p.Profession.ProfessionalLevel); }
    private static void SuppressProfession(ApocalypseEffectContext c, Player p,string replacement) { if(p.ApocalypseProfessionSuppression?.IsSuppressed==true)return; p.ApocalypseProfessionSuppression=new(){IsSuppressed=true,ReplacementId=replacement,OriginalProfessionName=p.Profession.Name}; c.Changed(p,"Profession",p.Profession.Name,"Професійні навички втрачені"); }
    private static readonly Dictionary<string,string> TraitOpposites=new(StringComparer.OrdinalIgnoreCase){{"Оптиміст","Песиміст"},{"Песиміст","Оптиміст"},{"Сміливий","Боягузливий"},{"Боягузливий","Сміливий"},{"Добрий","Жорстокий"},{"Жорстокий","Добрий"},{"Спокійний","Імпульсивний"},{"Імпульсивний","Спокійний"}};
    private static void ReplaceTrait(ApocalypseEffectContext c,Player p){var before=p.CharacterTrait.Name;if(TraitOpposites.TryGetValue(before,out var opposite))p.CharacterTrait=new(){Name=opposite,Type=p.CharacterTrait.Type};else{var options=c.GameData.CharacterTraits.Where(x=>!string.Equals(x.Trait,before,StringComparison.OrdinalIgnoreCase)).ToList();if(options.Count==0)return;var x=options[c.Random.Next(0,options.Count)];p.CharacterTrait=new(){Name=x.Trait,Type=x.Type,I18n=x.I18n};}c.Changed(p,"CharacterTrait",before,p.CharacterTrait.Name);}
    private static T Clone<T>(T value)=>JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value))!;
    private static void RotateBodyHealth(ApocalypseEffectContext c,IReadOnlyList<Player> players){if(players.Count<2)return;var shift=players.Count==2?1:c.Random.Next(1,players.Count);var bodies=players.Select(x=>Clone(x.Body)).ToList();var health=players.Select(x=>Clone(x.PhysicalHealth)).ToList();for(var i=0;i<players.Count;i++){var source=(i+shift)%players.Count;var before=$"{players[i].Body.Height}/{players[i].PhysicalHealth.Name}";players[i].Body=Clone(bodies[source]);players[i].PhysicalHealth=Clone(health[source]);c.Changed(players[i],"Body",before,$"{players[i].Body.Height}/{players[i].PhysicalHealth.Name}");c.Changed(players[i],"PhysicalHealth","changed","changed");}}
    private static void WorsenMental(ApocalypseEffectContext c,Player p,int step,string fallback){var before=p.MentalHealth.Name;var level=SeverityHelper.GetSeverityLevelFromCode(p.MentalHealth.SeverityCode);if(level==SeverityLevel.None){var data=c.GameData.MentalConditions.FirstOrDefault(x=>string.Equals(x.Id,fallback,StringComparison.OrdinalIgnoreCase));p.MentalHealth.Id=fallback;p.MentalHealth.BaseName=data?.Name??"Панічний розлад";level=SeverityLevel.Mild;}else level=(SeverityLevel)Math.Min((int)SeverityLevel.Critical,(int)level+Math.Max(1,step));p.MentalHealth.SeverityCode=SeverityHelper.GetSeverityCode(level);p.MentalHealth.SeverityLevel=SeverityHelper.GetSeverityName(level);p.MentalHealth.Name=SeverityHelper.FormatNameWithSeverity(p.MentalHealth.BaseName,level);c.Changed(p,"MentalHealth",before,p.MentalHealth.Name);}
    private static void RerollPhobia(ApocalypseEffectContext c,Player p,bool excludeNone,bool avoid){var options=c.GameData.Phobias.Where(x=>(!excludeNone||!x.Name.Contains("Немає",StringComparison.OrdinalIgnoreCase))&&(!avoid||!string.Equals(x.Id,p.Phobia.Id,StringComparison.OrdinalIgnoreCase))).ToList();if(options.Count==0)return;var x=options[c.Random.Next(0,options.Count)];var before=p.Phobia.Name;p.Phobia=new(){Id=x.Id,Name=x.Name,Description=x.Description,BunkerEffect=x.BunkerEffect,I18n=x.I18n};c.Changed(p,"Phobia",before,p.Phobia.Name);}
    private static readonly string[] Allergies=["pollen","dust","nuts","medicine","animal_dander","mold"];
    private static void AddAllergy(ApocalypseEffectContext c,Player p,bool avoid,string severity){var options=Allergies.Where(id=>!avoid||p.AdditionalConditionEffects.All(x=>!string.Equals(x.ConditionId,$"allergy_{id}",StringComparison.OrdinalIgnoreCase))).ToList();if(options.Count==0)return;var id=options[c.Random.Next(0,options.Count)];var code=SeverityCodes.Contains(severity,StringComparer.OrdinalIgnoreCase)?severity:"medium";p.AdditionalConditionEffects.Add(new(){Id=$"apocalypse:allergy:{id}",ConditionId=$"allergy_{id}",BaseName=$"allergy_{id}",Name=$"allergy_{id}",SeverityCode=code,SeverityLevel=SeverityHelper.GetSeverityName(SeverityHelper.GetSeverityLevelFromCode(code)),SourceThreatId="apocalypse"});c.Changed(p,"PhysicalHealth","none",$"allergy_{id}");}
    private static void CopyCharacteristic(ApocalypseEffectContext c,IReadOnlyList<Player> players,IReadOnlyList<string> keys,bool excludeSource){if(players.Count==0||keys.Count==0)return;var source=players[c.Random.Next(0,players.Count)];var key=keys[c.Random.Next(0,keys.Count)];foreach(var p in players.Where(x=>!excludeSource||x!=source))CopyField(c,source,p,key);}
    private static void CopyField(ApocalypseEffectContext c,Player source,Player target,string key){switch(key){case "Hobby":var h=target.Hobby.Name;target.Hobby=Clone(source.Hobby);c.Changed(target,key,h,target.Hobby.Name);break;case "CharacterTrait":var t=target.CharacterTrait.Name;target.CharacterTrait=Clone(source.CharacterTrait);c.Changed(target,key,t,target.CharacterTrait.Name);break;case "Phobia":var ph=target.Phobia.Name;target.Phobia=Clone(source.Phobia);c.Changed(target,key,ph,target.Phobia.Name);break;case "Fact":var f=target.Fact.Name;target.Fact=Clone(source.Fact);c.Changed(target,key,f,target.Fact.Name);break;default:throw new InvalidDataException("characteristic_key_invalid");}}
    private static void DegradeAsset(ApocalypseEffectContext c,Player p,IReadOnlyList<string> scopes,int steps,bool skipDestroyed){var choices=new List<Action>();if(scopes.Contains("inventory",StringComparer.OrdinalIgnoreCase))foreach(var item in p.Inventory.Items.Where(x=>!skipDestroyed||x.ConditionLevel<4))choices.Add(()=>{item.ConditionLevel=Math.Min(4,item.ConditionLevel+steps);c.Changed(p,"Inventory",item.Name,$"{item.Name}:{item.ConditionLevel}");});if(scopes.Contains("property",StringComparer.OrdinalIgnoreCase)&&p.Property!=null){var level=p.Property.GeneratedValues.GetValueOrDefault("conditionLevel");if(!skipDestroyed||level<4)choices.Add(()=>{p.Property.GeneratedValues["conditionLevel"]=Math.Min(4,level+steps);c.Changed(p,"Property",level.ToString(),p.Property.GeneratedValues["conditionLevel"].ToString());});}if(choices.Count>0)choices[c.Random.Next(0,choices.Count)]();}
    private static void ImprovePhysical(ApocalypseEffectContext c,Player p,int step){var before=p.PhysicalHealth.Name;var level=SeverityHelper.GetSeverityLevelFromCode(p.PhysicalHealth.SeverityCode);var next=(SeverityLevel)Math.Max((int)SeverityLevel.None,(int)level-Math.Max(1,step));p.PhysicalHealth.SeverityCode=next==SeverityLevel.None?null:SeverityHelper.GetSeverityCode(next);p.PhysicalHealth.SeverityLevel=next==SeverityLevel.None?null:SeverityHelper.GetSeverityName(next);p.PhysicalHealth.Name=next==SeverityLevel.None?"Здоровий":SeverityHelper.FormatNameWithSeverity(p.PhysicalHealth.BaseName,next);c.Changed(p,"PhysicalHealth",before,p.PhysicalHealth.Name);}
    private static void SwapCharacteristics(ApocalypseEffectContext c,IReadOnlyList<Player> players,IReadOnlyList<string> keys){if(players.Count<2)return;var first=c.Random.Next(0,players.Count);var second=c.Random.Next(0,players.Count-1);if(second>=first)second++;foreach(var key in keys){var a=players[first];var b=players[second];switch(key){case "Fact":var af=Clone(a.Fact);var bf=Clone(b.Fact);a.Fact=bf;b.Fact=af;c.Changed(a,key,"changed","changed");c.Changed(b,key,"changed","changed");break;case "Hobby":var ah=Clone(a.Hobby);var bh=Clone(b.Hobby);a.Hobby=bh;b.Hobby=ah;c.Changed(a,key,"changed","changed");c.Changed(b,key,"changed","changed");break;default:throw new InvalidDataException("swap_key_invalid");}}}
    private static void RerollHidden(ApocalypseEffectContext c,Player p,IReadOnlyList<string> keys){var eligible=keys.Where(key=>!Revealed(p,key)).ToList();if(eligible.Count==0)return;var key=eligible[c.Random.Next(0,eligible.Count)];switch(key){case "Hobby":var hobbies=c.GameData.Hobbies.Where(x=>!string.Equals(x.Hobby,p.Hobby.Name,StringComparison.OrdinalIgnoreCase)).ToList();if(hobbies.Count==0)return;var h=hobbies[c.Random.Next(0,hobbies.Count)];var hb=p.Hobby.Name;p.Hobby=new(){Name=h.Hobby,Type=h.Type,Item=h.Item,Bonus=h.Bonus,CapabilityTags=h.CapabilityTags.ToList(),I18n=h.I18n};c.Changed(p,key,hb,p.Hobby.Name);break;case "CharacterTrait":ReplaceTrait(c,p);break;case "Phobia":RerollPhobia(c,p,true,true);break;case "Fact":var facts=c.GameData.Facts.Where(x=>!string.Equals(x.Id,p.Fact.Id,StringComparison.OrdinalIgnoreCase)).ToList();if(facts.Count==0)return;var f=facts[c.Random.Next(0,facts.Count)];var fb=p.Fact.Name;p.Fact=new(){Id=f.Id,Source=f.Source,Type=f.Type,Category=f.Category,Name=f.Fact,Description=f.Description,I18n=f.I18n};c.Changed(p,key,fb,p.Fact.Name);break;case "MentalHealth":var mental=c.GameData.MentalConditions.Where(x=>!string.Equals(x.Id,p.MentalHealth.Id,StringComparison.OrdinalIgnoreCase)).ToList();if(mental.Count==0)return;var m=mental[c.Random.Next(0,mental.Count)];var mb=p.MentalHealth.Name;p.MentalHealth=new(){Id=m.Id,BaseName=m.Name,Name=m.Name,Category=m.Category,I18n=m.I18n,Localization=m.Localization};c.Changed(p,key,mb,p.MentalHealth.Name);break;default:throw new InvalidDataException("hidden_key_invalid");}}
    private static bool Revealed(Player p,string key)=>key switch{"Hobby"=>p.Revealed.Hobby,"CharacterTrait"=>p.Revealed.CharacterTrait,"Phobia"=>p.Revealed.Phobia,"Fact"=>p.Revealed.Fact,"MentalHealth"=>p.Revealed.MentalHealth,_=>true};
    private static bool Bool(Dictionary<string,JsonElement> p,string key,bool fallback=false)=>p.TryGetValue(key,out var v)&&v.ValueKind is JsonValueKind.True or JsonValueKind.False?v.GetBoolean():fallback;
    private static int Int(Dictionary<string,JsonElement> p,string key,int fallback=0)=>p.TryGetValue(key,out var v)&&v.TryGetInt32(out var x)?x:fallback;
    private static double Double(Dictionary<string,JsonElement> p,string key,double fallback=0)=>p.TryGetValue(key,out var v)&&v.TryGetDouble(out var x)?x:fallback;
    private static string String(Dictionary<string,JsonElement> p,string key,string fallback="")=>p.TryGetValue(key,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString()??fallback:fallback;
    private static IReadOnlyList<string> Strings(Dictionary<string,JsonElement> p,string key)=>p.TryGetValue(key,out var v)&&v.ValueKind==JsonValueKind.Array?v.EnumerateArray().Where(x=>x.ValueKind==JsonValueKind.String).Select(x=>x.GetString()!).ToList():[];
    private static IReadOnlyList<int> Ints(Dictionary<string,JsonElement> p,string key)=>p.TryGetValue(key,out var v)&&v.ValueKind==JsonValueKind.Array?v.EnumerateArray().Select(x=>x.GetInt32()).ToList():[];
}
