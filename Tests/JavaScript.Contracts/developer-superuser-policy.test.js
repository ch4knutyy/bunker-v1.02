const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const authority = read('Services', 'Bunker', 'Developer', 'DeveloperAuthorityService.cs');
const master = read('Hubs', 'BunkerHubGame', 'GameHub.GameMaster.cs');
const omniscient = read('Hubs', 'BunkerHubGame', 'GameHub.OmniscientGm.cs');
const state = read('Hubs', 'BunkerHubGame', 'GameHub.PostGameTransition.cs');
const rooms = read('Hubs', 'BunkerHubGame', 'GameHub.Rooms.cs');
const core = read('wwwroot', 'js', 'bunker', 'core', 'runtime.js');
const diagnostics = read('wwwroot', 'js', 'bunker', 'diagnostics', 'runtime.js');
const postgame = read('wwwroot', 'js', 'bunker', 'postgame', 'runtime.js');

test('verified Developer is a room superuser without host ownership replacement', () => {
  assert.match(authority, /CanUseHostControls[\s\S]*IsDeveloper\(player\)[\s\S]*CanUseGmControls[\s\S]*IsDeveloper\(player\)[\s\S]*CanViewOmniscientState[\s\S]*IsDeveloper\(player\)/);
  assert.match(master, /IsCallerHost\(\)[\s\S]*CanUseHostControls[\s\S]*HasGmCapability[\s\S]*CanUseGmControls/);
  assert.match(omniscient, /RequireOmniscientCaller[\s\S]*CanViewOmniscientState[\s\S]*BuildOmniscientHiddenState[\s\S]*CanViewOmniscientState/);
  assert.match(state, /room = room\.ToPublicInfo\(\)[\s\S]*omniscient = canViewOmniscientState[\s\S]*developer = isDeveloper/);
  assert.match(rooms, /RoomJoined[\s\S]*SendPlayerHostControlData\(room\)[\s\S]*SendPrivateOmniscientState\(room, player\)/);
  assert.match(core, /applyDeveloperAccessState[\s\S]*omniscient[\s\S]*clearOmniscientHiddenState/);
  assert.match(`${diagnostics}\n${postgame}`, /!isDeveloper && !isHost\) gmPlayersData = \{\}[\s\S]*const canManagePostGame = isHost \|\| isDeveloper/);
});
