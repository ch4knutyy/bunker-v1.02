namespace Bunker.Services;

public sealed class DeveloperAuthorityOptions
{
    public const string SectionName = "DeveloperAuthority";
    public bool DeveloperToolsEnabled { get; set; } = true;
    public bool ScenarioImageManagementEnabled { get; set; } = true;
    public bool PostGameStoryDirectorEnabled { get; set; } = true;
    public bool ContentEditingEnabled { get; set; } = true;
    public bool RecoveryToolsEnabled { get; set; } = true;
    public int OperatorReconnectWindowSeconds { get; set; } = 30;
}
