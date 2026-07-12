const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const threatsPath = path.join(root, "Hubs", "BunkerHubGame", "GameHub.Threats.cs");
const statePath = path.join(root, "Models", "Game", "ThreatInteractionState.cs");

const threatsSource = fs.readFileSync(threatsPath, "utf8");
const stateSource = fs.readFileSync(statePath, "utf8");

function extractMethod(source, methodName) {
  const declaration = new RegExp(`(?:public|private)\\s+(?:async\\s+)?(?:Task|void|object|[A-Za-z0-9_<>?,]+)\\s+${methodName}\\s*\\(`);
  const match = declaration.exec(source);
  assert(match, `Missing method ${methodName}`);

  const openIndex = source.indexOf("{", match.index);
  assert.notStrictEqual(openIndex, -1, `Missing method body for ${methodName}`);

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }

  throw new Error(`Unclosed method body for ${methodName}`);
}

function assertDoesNotUseRevealState(methodBody, methodName) {
  const forbidden = [
    "CurrentRoundReveals",
    "VotingReadyResponses",
    "SetCharacteristicRevealed",
    "RevealCharacteristic",
    "RevealCharacteristics",
    "HasRevealedThisRound",
    "HasUsedRevealAction",
    "RemainingReveals",
    "IsReadyForRound",
    "CurrentPhase != GamePhase.RoundReveal",
    "HaveAllActivePlayersRevealedThisRound",
  ];

  for (const token of forbidden) {
    assert(
      !methodBody.includes(token),
      `${methodName} must not depend on regular reveal/ready state (${token})`,
    );
  }
}

const contributeItem = extractMethod(threatsSource, "ContributeThreatItem");
const submitCapability = extractMethod(threatsSource, "SubmitThreatCapability");
const addContribution = extractMethod(threatsSource, "AddThreatContribution");
const withdrawContribution = extractMethod(threatsSource, "WithdrawThreatContribution");
const consumeItems = extractMethod(threatsSource, "ConsumeAcceptedThreatItems");
const buildPublicState = extractMethod(threatsSource, "BuildThreatPublicState");

assertDoesNotUseRevealState(contributeItem, "ContributeThreatItem");
assertDoesNotUseRevealState(submitCapability, "SubmitThreatCapability");

assert(
  contributeItem.includes("FindActiveThreatContributionBySource") &&
    contributeItem.includes("personal_inventory"),
  "Item contribution must reject an already reserved itemInstanceId/sourceId",
);

for (const field of [
  "ContributionId",
  "PlayerId",
  "ItemInstanceId",
  "Status",
  "IsHidden",
  "SubmittedRound",
  "ReservedForThreatId",
]) {
  assert(stateSource.includes(`public`) && stateSource.includes(field), `ThreatContributionState missing ${field}`);
}

assert(addContribution.includes("SubmittedRound = room.CurrentRound"), "Contribution must store submitted round");
assert(addContribution.includes("ReservedForThreatId"), "Contribution must reserve the item for a threat");
assert(addContribution.includes('ItemInstanceId = sourceType is "personal_inventory" or "profession_item" ? sourceId : ""'), "Item contribution must store item instance id");
assert(withdrawContribution.includes("RemoveAll"), "Withdrawal must release the reserved contribution");
assert(consumeItems.includes("Status = \"consumed\""), "Consumed threat items must leave active reservation state");

assert(
  buildPublicState.includes("revealedAfterResolution = threatState.Resolution.EffectsApplied") &&
    buildPublicState.includes("threatState.OperationBonuses.PublicExplanations"),
  "Public explanations may be revealed only after threat resolution",
);

assert(
  !buildPublicState.includes("targetPlayerId") &&
    !buildPublicState.includes("privateResult") &&
    !buildPublicState.includes("effectType"),
  "Public threat contribution state must not expose private or technical fields",
);

console.log("Threat contribution independence checks passed.");
