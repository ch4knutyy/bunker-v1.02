using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Encodings.Web;
using Bunker.Models;

namespace Bunker.Services;

public sealed record PostGameStoryPrompt(string Text, string Fingerprint);

public sealed class PostGameStoryPromptBuilder
{
    public const string ResponseSchema = """{"schemaVersion":1,"mode":"final_story","title":"...","subtitle":"...","survivalScore":0,"verdictCode":"...","verdictText":"...","estimatedHorizon":"...","opening":"...","chapters":[{"title":"...","text":"..."}],"survivorEpilogues":[{"playerName":"...","role":"...","fate":"..."}],"eliminatedPlayerFates":[{"playerName":"...","usefulnessAssessment":"...","fate":"..."}],"bunkerOutcome":"...","humanityOutcomePreview":"...","bunkerContributionPreview":"...","strengths":[],"criticalRisks":[],"finalSummary":"...","continuationHooks":[],"humanityOutcome":"...","worldTimeline":[],"bunkerRole":"...","bunkerContribution":"...","legacy":"...","keyContributors":[],"decisionAssessment":"...","groupLosses":[]}""";
    public const int MaxPromptLength = 120_000;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public PostGameStoryPrompt Build(Room room, string mode, string? parentEntryId = null)
    {
        if (!PostGameStoryModes.All.Contains(mode)) throw new ArgumentException("story_mode_invalid", nameof(mode));

        var survivors = RoomService.GetPlayersSnapshot(room).Select(x => x.Value)
            .Where(IsNarrativePlayer).Where(player => !player.IsEliminated).OrderBy(player => player.SeatNumber).ToList();
        var eliminated = RoomService.GetPlayersSnapshot(room).Select(x => x.Value)
            .Where(IsNarrativePlayer).Where(player => player.IsEliminated).OrderBy(player => player.EliminatedAtRound).ThenBy(player => player.SeatNumber).ToList();
        var priorEntries = room.PostGameStory.PublishedEntries
            .Where(entry => parentEntryId == null || entry.Id == parentEntryId || entry.PublishedAtUtc <= room.PostGameStory.PublishedEntries.FirstOrDefault(x => x.Id == parentEntryId)?.PublishedAtUtc)
            .Select(entry => new { entry.Id, entry.ParentEntryId, entry.Mode, entry.Title, entry.FinalSummary, entry.ContinuationHooks })
            .ToList();

        var builder = new StringBuilder(24_000);
        builder.AppendLine("# РОЛЬ\n");
        builder.AppendLine("Ти — автор серйозної кінематографічної постапокаліптичної хроніки.\n");
        builder.AppendLine("# ЗАВДАННЯ\n");
        builder.AppendLine(ModeInstruction(mode));
        builder.AppendLine("Не супереч уже опублікованим подіям. Не вигадуй ресурси, яких не було.\n");
        builder.AppendLine("# ВИМОГИ ДО ІСТОРІЇ\n");
        builder.AppendLine("- Врахуй усі передані характеристики, проблеми бункера, тривалість апокаліпсиса і співвідношення запасів до мешканців.\n- Врахуй здоров’я, професії, хобі, предмети, майно, загрози та наслідки.\n- Згадай кожного survivor і визнач долю кожного eliminated player.\n- Не роби всіх однаково важливими й не давай всім автоматично щасливий фінал.\n- Допускається лише логічний розвиток подій після партії.\n- Оцінка виживання сюжетна, не є науковою гарантією.\n");
        AppendJson(builder, "АПОКАЛІПСИС", ApocalypseContext(room));
        AppendJson(builder, "БУНКЕР", BunkerContext(room));
        AppendJson(builder, "МЕШКАНЦІ, ЯКІ ЗАЛИШИЛИСЯ", survivors.Select(player => PlayerContext(room, player)));
        AppendJson(builder, "ВИБУЛІ ГРАВЦІ", eliminated.Select(player => PlayerContext(room, player)));
        AppendJson(builder, "ХРОНІКА ПАРТІЇ", HistoryContext(room));
        if (priorEntries.Count > 0) AppendJson(builder, "ПОПЕРЕДНЯ ОПУБЛІКОВАНА ХРОНІКА", priorEntries);
        builder.AppendLine("# RESPONSE CONTRACT\n");
        builder.AppendLine(ResponseContract(mode, survivors.Select(x => x.Name), eliminated.Select(x => x.Name)));
        builder.AppendLine("Поверни лише JSON. Не додавай Markdown code fence, пояснення перед JSON або після JSON.");

        var text = builder.ToString();
        if (text.Length > MaxPromptLength) throw new InvalidOperationException("story_prompt_too_large");
        return new(text, Fingerprint(text));
    }

    private static bool IsNarrativePlayer(Player player) => !player.IsLobbySpectator && !player.IsSpectatorGm && player.GmRole != GmMode.TechnicalGm;

    private static object ApocalypseContext(Room room) => room.Apocalypse is null ? new { missing = true } : new
    {
        room.Apocalypse.Name, room.Apocalypse.CategoryId, room.Apocalypse.Description, room.Apocalypse.Severity,
        room.Apocalypse.SurvivalChance, room.Apocalypse.Duration, room.Apocalypse.Threats, room.Apocalypse.Requirements,
        room.Apocalypse.Tags,
        interactiveEffects = room.ApocalypseEffectRuntime == null ? null : new
        {
            room.ApocalypseEffectRuntime.SuccessfulActivationCount,
            room.ApocalypseEffectRuntime.FailedActivationCount,
            room.ApocalypseEffectRuntime.LastSuccessfulRound,
            history = room.ApocalypseEffectRuntime.History.Select(x => new
            {
                x.Round, x.ActivationNumber, x.Result, x.EffectTypes, x.AffectedPlayerCount, x.PublicSummaryCode
            })
        }
    };

    private static object BunkerContext(Room room) => room.Bunker is null ? new { missing = true } : new
    {
        room.Bunker.Name, room.Bunker.Description, room.Bunker.Location, room.Bunker.Condition,
        capacity = room.ResolvedBunkerCapacity ?? room.Bunker.Capacity,
        peopleRemaining = room.GameplayPlayerCount,
        foodMonths = room.Bunker.SuppliesMonths,
        waterMonths = room.Bunker.WaterMonths,
        room.Bunker.Facilities, room.Bunker.Resources, room.Bunker.Problems, room.Bunker.BunkerTags,
        threatAssets = new
        {
            resources = room.Bunker.ThreatAssets.Resources.Select(x => new { name = x.GetName(), x.Status, x.Quantity }),
            facilities = room.Bunker.ThreatAssets.Facilities.Select(x => new { name = x.GetName(), x.Status, x.Quantity })
        },
        scenarioConsequences = room.ScenarioSituations == null ? null : new
        {
            room.ScenarioSituations.LastActualScenarioRound,
            history = room.ScenarioSituations.History.Select(x => new { x.Type, x.ActualRound, x.Result })
        },
        bunkerIntel = room.BunkerIntel == null ? null : new
        {
            mode = room.BunkerIntel.Mode.ToString(), room.BunkerIntel.PublicCategories, room.BunkerIntel.LastProgressiveRevealRound
        }
    };

    private static object PlayerContext(Room room, Player player) => new
    {
        player.Name, player.SeatNumber, player.IsEliminated, player.EliminatedAtRound, player.EliminatedByVote,
        demographics = new { player.Personality.Age, player.Personality.Sex, player.Personality.SexOrientation, player.Personality.IsChildfree },
        profession = new { player.Profession.Name, player.Profession.ExperienceYears, player.Profession.ProfessionalLevel, player.Profession.Skills, player.Profession.SelectedItem, player.Profession.Bonus },
        professionItem = new { player.ProfessionItem.Name, player.ProfessionItem.Description, player.ProfessionItem.Quantity, player.ProfessionItem.Unit },
        hobby = new { player.Hobby.Name, player.Hobby.Type, player.Hobby.Item, player.Hobby.Bonus },
        personality = player.Personality,
        body = player.Body,
        physicalHealth = new { player.PhysicalHealth.Name, player.PhysicalHealth.SeverityLevel, player.PhysicalHealth.Description, player.PhysicalHealth.GameEffect },
        additionalPhysicalConditions = player.AdditionalConditionEffects.Select(x => new { x.Name, x.SeverityLevel, x.Description, x.AppliedAtRound }),
        mentalHealth = new { player.MentalHealth.Name, player.MentalHealth.SeverityLevel, player.MentalHealth.Description, player.MentalHealth.GameEffect },
        phobia = new { player.Phobia.Name, player.Phobia.Description, player.Phobia.BunkerEffect },
        characterTrait = new { player.CharacterTrait.Name, player.CharacterTrait.Type },
        fact = new { player.Fact.Name, player.Fact.Description, player.Fact.Type },
        inventory = new { player.Inventory.Size, items = player.Inventory.Items.Select(x => new { x.Name, x.Description, x.Quantity, x.Unit, x.IsUsefulInBunker, x.ConditionLevel }) },
        property = player.Property == null ? null : new { display = player.Property.GetDisplayText("uk"), player.Property.Category, player.Property.SizeClass, player.Property.GeneratedValues },
        specialCards = player.SpecialCards.Select(x => new { x.Name, x.Description, x.IsUsed, x.IsActive, x.UsedAtRound, x.EffectResult, x.PublicResult, x.PrivateResult }),
        eventCards = player.EventSpecialCards.Select(x => new { x.DefinitionId, status = x.Status.ToString(), result = x.Result.ToString(), x.UsedAtRound, x.ResolvedAtRound }),
        threatParticipation = new
        {
            participatedInCurrentThreat = room.ThreatState?.ParticipantPlayerIds.Contains(RoomService.GetPlayerKey(player), StringComparer.OrdinalIgnoreCase) == true,
            contributions = room.ThreatState?.Contributions
                .Where(x => string.Equals(x.OwnerPlayerId, RoomService.GetPlayerKey(player), StringComparison.OrdinalIgnoreCase))
                .Select(x => new { x.SourceType, x.DisplayName, x.Status, x.IsConsumed })
        },
        revealed = player.Revealed,
        finalStatus = player.IsEliminated ? "eliminated" : "survivor"
    };

    private static object HistoryContext(Room room)
    {
        var threatOutcomes = room.ThreatAuditLog
            .Where(entry => entry.EventType is ThreatAuditEventType.Revealed or ThreatAuditEventType.CompletedSuccess or ThreatAuditEventType.CompletedFailure)
            .GroupBy(entry => entry.ThreatId, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var latest = group.OrderBy(entry => entry.SequenceId).Last();
                var completed = group.OrderBy(entry => entry.SequenceId).LastOrDefault(entry =>
                    entry.EventType is ThreatAuditEventType.CompletedSuccess or ThreatAuditEventType.CompletedFailure);
                return new
                {
                    name = string.IsNullOrWhiteSpace(latest.ThreatName) ? latest.ThreatId : latest.ThreatName,
                    round = latest.Round,
                    outcome = completed?.EventType switch
                    {
                        ThreatAuditEventType.CompletedSuccess => "resolved_success",
                        ThreatAuditEventType.CompletedFailure => "resolved_failure",
                        _ => "unresolved"
                    }
                };
            }).ToList();
        return new
        {
            rounds = room.Completion?.CompletedAtRound ?? room.CurrentRound,
            completionReason = room.Completion?.Reason,
            voting = room.CurrentVoting == null ? null : new { room.CurrentVoting.Round, state = room.CurrentVoting.State.ToString() },
            eliminated = RoomService.GetPlayersSnapshot(room).Select(x => x.Value).Where(x => x.IsEliminated).Select(x => new { x.Name, x.EliminatedAtRound, x.EliminatedByVote }),
            triggeredThreats = room.TriggeredThreatIds.OrderBy(x => x),
            resolvedThreats = threatOutcomes.Where(x => x.outcome == "resolved_success"),
            failedThreats = threatOutcomes.Where(x => x.outcome == "resolved_failure"),
            unresolvedThreats = threatOutcomes.Where(x => x.outcome == "unresolved"),
            currentThreat = room.CurrentThreat == null ? null : new { room.CurrentThreat.Name, status = room.ThreatState?.ThreatStatus, resolution = room.ThreatState?.Resolution },
            scenarioSituations = room.ScenarioSituations?.History.Select(x => new { x.Type, x.ActualRound, x.Result }),
            appliedApocalypseEffects = room.ApocalypseEffectRuntime?.History.Select(x => new
            {
                x.Round, x.ActivationNumber, x.Result, x.EffectTypes, x.AffectedPlayerCount, x.PublicSummaryCode
            })
        };
    }

    private static void AppendJson(StringBuilder builder, string heading, object value)
    {
        builder.Append("# ").Append(heading).AppendLine("\n");
        builder.AppendLine(JsonSerializer.Serialize(value, JsonOptions));
        builder.AppendLine();
    }

    private static string ModeInstruction(string mode) => mode switch
    {
        PostGameStoryModes.Continuation => "Продовж життя бункера, використай continuationHooks, покажи нову кризу або розвиток і не переписуй попередній фінал.\n",
        PostGameStoryModes.HumanityOutcome => "Опиши, як людство пережило апокаліпсис: світ, тривалість катастрофи, збережені знання, нові суспільства й місце цього бункера.\n",
        PostGameStoryModes.BunkerContribution => "Опиши внесок цього бункера у відновлення: професії, знання, ресурси, врятованих людей, помилки та спадщину.\n",
        PostGameStoryModes.EliminatedFates => "Створи зв’язну паралельну хроніку доль усіх вибулих і оціни, чи було рішення про їх вибуття правильним.\n",
        _ => "Створи фінальну історію цієї партії гри «Бункер».\n"
    };

    private static string ResponseContract(string mode, IEnumerable<string> survivors, IEnumerable<string> eliminated) => $$"""
        Схема: {{ResponseSchema.Replace("\"final_story\"", $"\"{mode}\"", StringComparison.Ordinal)}}
        Обов'язкові survivors: {{string.Join(", ", survivors)}}.
        Обов'язкові eliminated players: {{string.Join(", ", eliminated)}}.
        Для humanity_outcome обов'язкові humanityOutcome і bunkerRole; для bunker_contribution — bunkerContribution і legacy; для eliminated_fates — eliminatedPlayerFates, decisionAssessment і groupLosses.
        """;

    public static string Fingerprint(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
