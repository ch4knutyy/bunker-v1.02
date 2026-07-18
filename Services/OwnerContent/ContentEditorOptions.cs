namespace Bunker.Services.OwnerContent;

public sealed class ContentEditorOptions
{
	public const string SectionName = "ContentEditor";
	public bool Enabled { get; set; }
	public List<string> AllowedRoots { get; set; } = ["wwwroot/data"];
	public string BackupRoot { get; set; } = "App_Data/content-editor/backups";
	public long MaxDocumentBytes { get; set; } = 20_971_520;
	public int MaxBackupsPerFile { get; set; } = 50;
}
