using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
	public async Task<GmPanelStateDto> GetGmPanelState()
	{
		var connectionId = Context.ConnectionId;
		Room? room = null;
		Player? caller = null;
		try
		{
			room = _roomService.GetPlayerRoom(connectionId);
			if (room is null)
			{
				_logger.LogWarning(
					"GM panel state rejected. Connection {ConnectionId}, ErrorCode {ErrorCode}",
					ShortGmPanelIdentifier(connectionId),
					"room_not_found");
				throw new HubException("room_not_found");
			}
			if (!_roomService.TryResolvePlayer(
					room,
					connectionId,
					out _,
					out caller))
			{
				_logger.LogWarning(
					"GM panel state rejected. Connection {ConnectionId}, Room {RoomCode}, ErrorCode {ErrorCode}",
					ShortGmPanelIdentifier(connectionId),
					room.Id,
					"gm_panel_access_denied");
				throw new HubException("gm_panel_access_denied");
			}

			var isDeveloper = _developerAuthority.IsDeveloper(caller);
			var developerCanMutate = !isDeveloper ||
				_developerAuthority.IsActiveOperator(room, caller, Context.ConnectionId);
			var canOpenContentEditor = isDeveloper && developerCanMutate &&
				_developerAuthority.FeatureAllows(RoomActorCapability.EditGlobalContent);
			var state = _gmPanelStateBuilder.TryBuild(
				room,
				caller,
				canOpenContentEditor,
				isDeveloper,
				_developerAuthority.FeatureAllows(RoomActorCapability.UseDeveloperTools),
				_developerAuthority.FeatureAllows(RoomActorCapability.UseRecoveryTools),
				developerCanMutate);
			if (state is null)
			{
				_logger.LogWarning(
					"GM panel state rejected. Connection {ConnectionId}, Room {RoomCode}, Player {PlayerId}, Role {Role}, State {RoomState}, ErrorCode {ErrorCode}",
					ShortGmPanelIdentifier(connectionId),
					room.Id,
					RoomService.GetPlayerKey(caller),
					caller.GmRole,
					room.State,
					"gm_panel_access_denied");
				throw new HubException("gm_panel_access_denied");
			}

			_logger.LogInformation(
				"GM panel state built. Connection {ConnectionId}, Room {RoomCode}, Player {PlayerId}, Role {Role}, State {RoomState}",
				ShortGmPanelIdentifier(connectionId),
				room.Id,
				RoomService.GetPlayerKey(caller),
				state.Role,
				room.State);
			return state;
		}
		catch (HubException)
		{
			throw;
		}
		catch (Exception exception)
		{
			_logger.LogError(
				exception,
				"GM panel state failed. Connection {ConnectionId}, Room {RoomCode}, Player {PlayerId}, Role {Role}, State {RoomState}, ErrorCode {ErrorCode}",
				ShortGmPanelIdentifier(connectionId),
				room?.Id,
				caller is null ? null : RoomService.GetPlayerKey(caller),
				caller?.GmRole,
				room?.State,
				"gm_panel_state_failed");
			throw new HubException("gm_panel_state_failed");
		}
	}

	public Task<PropertyEditorDataDto> GetPlayerPropertyEditor(
		string targetPlayerId,
		string? language = null)
	{
		if (!TryGetPropertyEditorContext(out var room, out _))
		{
			throw new HubException("gm_panel_access_denied");
		}
		if (!_roomService.TryResolvePlayer(
				room,
				targetPlayerId,
				out _,
				out var target))
		{
			throw new HubException("player_not_found");
		}

		var normalizedLanguage = NormalizePropertyEditorLanguage(language);
		var current = BuildPropertyClientState(target.Property);
		return Task.FromResult(new PropertyEditorDataDto(
			RoomService.GetPlayerKey(target),
			target.Name ?? "Unknown",
			current?.DefinitionId,
			current?.GeneratedValues ??
				new Dictionary<string, int>(StringComparer.Ordinal),
			current == null
				? null
				: _gameData.BuildPropertyPresentation(current, normalizedLanguage),
			BuildPropertyEditorDefinitions(normalizedLanguage)));
	}

	public Task<PropertyEditorPreviewDto> PreviewPlayerProperty(
		string definitionId,
		string? language = null)
	{
		if (!TryGetPropertyEditorContext(out _, out _))
		{
			throw new HubException("gm_panel_access_denied");
		}

		var generated = _generator.GeneratePropertyForDefinition(definitionId);
		if (generated == null)
		{
			throw new HubException("property_definition_not_found");
		}

		return Task.FromResult(new PropertyEditorPreviewDto(
			generated.DefinitionId,
			generated.GeneratedValues,
			_gameData.BuildPropertyPresentation(generated, language)));
	}

	public async Task UpdatePlayerProperty(
		string targetPlayerId,
		string definitionId,
		Dictionary<string, int> generatedValues,
		string commandId)
	{
		if (!TryGetPropertyEditorContext(out var room, out var actor))
		{
			throw new HubException("gm_panel_access_denied");
		}
		if (!_roomService.TryResolvePlayer(
				room,
				targetPlayerId,
				out var targetConnectionId,
				out var target))
		{
			throw new HubException("player_not_found");
		}
		if (string.IsNullOrWhiteSpace(commandId))
		{
			throw new HubException("duplicate_command");
		}
		if (!_gameData.TryCreateProperty(
				definitionId,
				generatedValues,
				out var property,
				out var errorCode))
		{
			await AppendGmAudit(
				room,
				RoomService.GetPlayerKey(actor),
				"player_property_update",
				GmAuditResult.Rejected,
				"Player property edit was rejected by canonical validation.",
				RoomService.GetPlayerKey(target),
				commandId,
				errorCode);
			throw new HubException(errorCode);
		}
		if (!RememberPlayerCommand(room, commandId))
		{
			await Clients.Caller.SendAsync("GMActionSuccess", new
			{
				action = "property_updated",
				playerName = target.Name,
				idempotent = true
			});
			return;
		}

		var snapshot = CreateMutationSnapshot(
			room,
			RoomService.GetPlayerKey(actor),
			"player_property_update",
			commandId,
			"Before player property edit");
		target.Property = property;
		_roomService.UpdatePlayer(targetConnectionId, target);

		await SendPersonalPlayerSnapshot(
			targetConnectionId,
			target,
			"gm_property_updated");
		if (target.Revealed.Property)
		{
			await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
			{
				connectionId = targetConnectionId,
				playerName = target.Name,
				characteristicKey = "Property",
				data = GetRevealedDataForCharacteristic(target, "Property")
			});
		}
		await SendPlayerHostControlData(room);
		await SendPublicPlayersUpdate(room);
		await AppendGmAudit(
			room,
			RoomService.GetPlayerKey(actor),
			"player_property_update",
			GmAuditResult.Success,
			"Player property was updated from the GM panel.",
			RoomService.GetPlayerKey(target),
			commandId,
			snapshot: snapshot);
		await Clients.Caller.SendAsync("GMActionSuccess", new
		{
			action = "property_updated",
			playerName = target.Name,
			definitionId = property.DefinitionId,
			idempotent = false
		});
	}

	private bool TryGetPropertyEditorContext(out Room room, out Player actor)
	{
		room = _roomService.GetPlayerRoom(Context.ConnectionId)!;
		actor = null!;
		return room != null &&
			_roomService.TryResolvePlayer(
				room,
				Context.ConnectionId,
				out _,
				out actor) &&
			(HasActiveRoomCapability(room, actor, RoomActorCapability.ManagePlayers) ||
			 (room.IsHost(actor) && !actor.IsSpectatorGm && actor.GmRole != GmMode.OmniscientGm));
	}

	private IReadOnlyList<PropertyEditorDefinitionDto> BuildPropertyEditorDefinitions(
		string language) =>
		_gameData.Properties
			.Select(definition =>
			{
				var title = LocalizedPropertyEditorValue(
					definition.I18n?.Item,
					language) ?? definition.Item;
				var fields = (definition.RandomProperties ?? [])
					.Select(field =>
					{
						var displayField = (definition.DisplayFields ?? [])
							.FirstOrDefault(item =>
								string.Equals(
									item.Key,
									field.Key,
									StringComparison.OrdinalIgnoreCase) ||
								(string.Equals(
										field.Key,
										"conditionLevel",
										StringComparison.OrdinalIgnoreCase) &&
								 string.Equals(
										item.Source,
										"conditionProfile",
										StringComparison.OrdinalIgnoreCase)));
						var isCondition = string.Equals(
							field.Key,
							"conditionLevel",
							StringComparison.OrdinalIgnoreCase);
						var options = new List<PropertyEditorConditionOptionDto>();
						if (isCondition &&
							_gameData.PropertyConditionProfiles.TryGetValue(
								definition.ConditionProfile,
								out var profile))
						{
							for (var level = field.Min; level <= field.Max; level++)
							{
								if (profile.Values.TryGetValue(
										level.ToString(
											System.Globalization.CultureInfo.InvariantCulture),
										out var localized))
								{
									options.Add(new(
										level,
										LocalizedPropertyEditorValue(
											localized,
											language) ?? level.ToString()));
								}
							}
						}

						return new PropertyEditorFieldDto(
							field.Key,
							LocalizedPropertyEditorValue(
								displayField?.Label,
								language) ?? field.Key,
							field.Min,
							field.Max,
							isCondition,
							options);
					})
					.ToArray();
				return new PropertyEditorDefinitionDto(
					definition.Id,
					title,
					definition.ConditionProfile,
					fields);
			})
			.OrderBy(definition => definition.Title, StringComparer.CurrentCultureIgnoreCase)
			.ToArray();

	private static string NormalizePropertyEditorLanguage(string? language)
	{
		var normalized = string.IsNullOrWhiteSpace(language)
			? "uk"
			: language.Trim().ToLowerInvariant();
		return normalized is "uk" or "en" or "ru" ? normalized : "uk";
	}

	private static string? LocalizedPropertyEditorValue(
		IReadOnlyDictionary<string, string>? values,
		string language)
	{
		if (values != null &&
			values.TryGetValue(language, out var localized) &&
			!string.IsNullOrWhiteSpace(localized))
		{
			return localized;
		}
		return values != null &&
			values.TryGetValue("uk", out var fallback) &&
			!string.IsNullOrWhiteSpace(fallback)
				? fallback
				: null;
	}

	private static string ShortGmPanelIdentifier(string? value) =>
		string.IsNullOrWhiteSpace(value)
			? "none"
			: value[..Math.Min(value.Length, 8)];
}
