using System.ComponentModel.DataAnnotations;

namespace Bunker.Models.ViewModels.Account;

public sealed class LoginViewModel
{
	[Required(ErrorMessage = "Вкажіть email.")]
	[EmailAddress(ErrorMessage = "Вкажіть коректний email.")]
	[Display(Name = "Email")]
	public string Email { get; set; } = string.Empty;

	[Required(ErrorMessage = "Вкажіть пароль.")]
	[DataType(DataType.Password)]
	[Display(Name = "Пароль")]
	public string Password { get; set; } = string.Empty;

	[Display(Name = "Запам’ятати мене")]
	public bool RememberMe { get; set; }

	public string? ReturnUrl { get; set; }
}
