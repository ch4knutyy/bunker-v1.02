const fs = require('fs');

const bunkerViewFiles = [
  'Views/Bunker/Index.cshtml',
  'Views/Shared/Bunker/_GmPanel.cshtml',
  'Views/Shared/Bunker/_GlobalContentCatalog.cshtml',
  'Views/Shared/Bunker/_RoomLobby.cshtml',
  'Views/Shared/Bunker/_GameBoard.cshtml',
  'Views/Shared/Bunker/_EventsPanel.cshtml',
  'Views/Shared/Bunker/_PlayerCard.cshtml',
  'Views/Shared/Bunker/_CharacteristicTooltip.cshtml',
];

function readBunkerView() {
  return bunkerViewFiles
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

module.exports = { readBunkerView };
