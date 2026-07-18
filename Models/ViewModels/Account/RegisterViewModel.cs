using System.ComponentModel.DataAnnotations;

namespace Bunker.Models.ViewModels.Account;

public sealed class RegisterViewModel
{
	[Required(ErrorMessage = "Вкажіть ім’я.")]
	[StringLength(32, MinimumLength = 2, ErrorMessage = "Ім’я має містити від 2 до 32 символів.")]
	[Display(Name = "Ім’я")]
	public string DisplayName { get; set; } = string.Empty;

	[Required(ErrorMessage = "Вкажіть email.")]
	[EmailAddress(ErrorMessage = "Вкажіть коректний email.")]
	[Display(Name = "Email")]
	public string Email { get; set; } = string.Empty;

	[Required(ErrorMessage = "Вкажіть пароль.")]
	[StringLength(100, MinimumLength = 8, ErrorMessage = "Пароль має містити щонайменше 8 символів.")]
	[DataType(DataType.Password)]
	[Display(Name = "Пароль")]
	public string Password { get; set; } = string.Empty;

	[Required(ErrorMessage = "Повторіть пароль.")]
	[DataType(DataType.Password)]
	[Compare(nameof(Password), ErrorMessage = "Паролі не збігаються.")]
	[Display(Name = "Підтвердження пароля")]
	public string ConfirmPassword { get; set; } = string.Empty;

	public string? ReturnUrl { get; set; }
}
