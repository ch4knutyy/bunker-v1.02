using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
        #region Helper Methods

        /// <summary>
        /// Sanitize and validate player name
        /// </summary>
        private string SanitizePlayerName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "";
            
            // Trim whitespace
            name = name.Trim();
            
            // Limit to 10 characters
            if (name.Length > 10)
                name = name.Substring(0, 10);
            
            return name;
        }

        #endregion
    }
}


