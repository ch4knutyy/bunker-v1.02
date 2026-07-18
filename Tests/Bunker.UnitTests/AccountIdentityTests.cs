using System.ComponentModel.DataAnnotations;
using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Bunker.Data.Persistence.Identity;
using Bunker.Models.ViewModels.Account;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bunker.UnitTests;

public sealed class AccountIdentityTests
{
	[Fact]
	public async Task IdentityUserAndGameSessionPersistInSameDatabase()
	{
		await using var connection = new SqliteConnection("Data Source=:memory:");
		await connection.OpenAsync();

		var options = new DbContextOptionsBuilder<BunkerDbContext>()
			.UseSqlite(connection)
			.Options;
		var userId = Guid.NewGuid();
		var sessionId = Guid.NewGuid();
		var createdAtUtc = new DateTime(2026, 7, 18, 3, 0, 0, DateTimeKind.Utc);

		await using (var writeContext = new BunkerDbContext(options))
		{
			await writeContext.Database.EnsureCreatedAsync();
			writeContext.Users.Add(new ApplicationUser
			{
				Id = userId,
				UserName = "resident@example.com",
				NormalizedUserName = "RESIDENT@EXAMPLE.COM",
				Email = "resident@example.com",
				NormalizedEmail = "RESIDENT@EXAMPLE.COM",
				DisplayName = "Resident",
				CreatedAtUtc = createdAtUtc
			});
			writeContext.GameSessions.Add(new GameSessionEntity
			{
				Id = sessionId,
				RoomCode = "IDENTITY",
				CreatedAtUtc = DateTime.UtcNow,
				Status = "Created",
				PlayerCount = 2
			});

			await writeContext.SaveChangesAsync();
		}

		await using var readContext = new BunkerDbContext(options);
		var savedUser = await readContext.Users.SingleAsync(user => user.Id == userId);
		var savedSession = await readContext.GameSessions.SingleAsync(session => session.Id == sessionId);

		Assert.Equal(userId, savedUser.Id);
		Assert.Equal("Resident", savedUser.DisplayName);
		Assert.Equal("resident@example.com", savedUser.Email);
		Assert.Equal(createdAtUtc, savedUser.CreatedAtUtc);
		Assert.Equal("IDENTITY", savedSession.RoomCode);
	}

	[Fact]
	public void RegisterModelRejectsInvalidEmail()
	{
		var model = ValidRegisterModel();
		model.Email = "not-an-email";

		Assert.Contains(Validate(model), result => result.MemberNames.Contains(nameof(model.Email)));
	}

	[Fact]
	public void RegisterModelRejectsShortPassword()
	{
		var model = ValidRegisterModel();
		model.Password = "Abc123";
		model.ConfirmPassword = model.Password;

		Assert.Contains(Validate(model), result => result.MemberNames.Contains(nameof(model.Password)));
	}

	[Fact]
	public void RegisterModelRejectsMismatchedConfirmation()
	{
		var model = ValidRegisterModel();
		model.ConfirmPassword = "Different123";

		Assert.Contains(Validate(model), result => result.MemberNames.Contains(nameof(model.ConfirmPassword)));
	}

	[Theory]
	[InlineData("A")]
	[InlineData("123456789012345678901234567890123")]
	public void RegisterModelRejectsDisplayNameOutsideBounds(string displayName)
	{
		var model = ValidRegisterModel();
		model.DisplayName = displayName;

		Assert.Contains(Validate(model), result => result.MemberNames.Contains(nameof(model.DisplayName)));
	}

	[Theory]
	[InlineData("A")]
	[InlineData("123456789012345678901234567890123")]
	public void EditProfileModelRejectsDisplayNameOutsideBounds(string displayName)
	{
		var model = new EditProfileViewModel { DisplayName = displayName };

		Assert.Contains(Validate(model), result => result.MemberNames.Contains(nameof(model.DisplayName)));
	}

	private static RegisterViewModel ValidRegisterModel()
	{
		return new RegisterViewModel
		{
			DisplayName = "Resident",
			Email = "resident@example.com",
			Password = "Password1",
			ConfirmPassword = "Password1"
		};
	}

	private static IReadOnlyCollection<ValidationResult> Validate(object model)
	{
		var results = new List<ValidationResult>();
		Validator.TryValidateObject(model, new ValidationContext(model), results, validateAllProperties: true);
		return results;
	}
}
