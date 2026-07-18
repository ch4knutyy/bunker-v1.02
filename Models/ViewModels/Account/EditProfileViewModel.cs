using System.ComponentModel.DataAnnotations;

namespace Bunker.Models.ViewModels.Account;

public sealed class EditProfileViewModel
{
	[Required(ErrorMessage = "Вкажіть ім’я.")]
	[StringLength(32, MinimumLength = 2, ErrorMessage = "Ім’я має містити від 2 до 32 символів.")]
	[Display(Name = "Ім’я")]
	public string DisplayName { get; set; } = string.Empty;
}
