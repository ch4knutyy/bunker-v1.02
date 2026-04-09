using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services
{
    /// <summary>
    /// Сервіс для управління зображеннями сценаріїв (апокаліпсисів та бункерів)
    /// </summary>
    public class ScenarioImageService
    {
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<ScenarioImageService> _logger;
        
        // Шляхи для збереження зображень
        private readonly string _apocalypseImagesPath;
        private readonly string _bunkerImagesPath;
        
        // Кеш URL-адрес зображень (id -> imageUrl)
        private readonly Dictionary<string, string> _apocalypseImageUrls = new();
        private readonly Dictionary<string, string> _bunkerImageUrls = new();
        
        // Дозволені розширення файлів
        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".webp", ".gif"
        };
        
        // Максимальний розмір файлу (5 MB)
        private const long MaxFileSize = 5 * 1024 * 1024;
        
        public ScenarioImageService(IWebHostEnvironment env, ILogger<ScenarioImageService> logger)
        {
            _env = env;
            _logger = logger;
            
            // Створюємо директорії для зображень
            _apocalypseImagesPath = Path.Combine(_env.WebRootPath, "uploads", "apocalypses");
            _bunkerImagesPath = Path.Combine(_env.WebRootPath, "uploads", "bunkers");
            
            EnsureDirectoriesExist();
            LoadExistingImages();
        }
        
        private void EnsureDirectoriesExist()
        {
            try
            {
                Directory.CreateDirectory(_apocalypseImagesPath);
                Directory.CreateDirectory(_bunkerImagesPath);
                _logger.LogInformation("Директорії для зображень створено/перевірено");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Помилка створення директорій для зображень");
            }
        }
        
        /// <summary>
        /// Завантажити існуючі зображення при старті
        /// </summary>
        private void LoadExistingImages()
        {
            try
            {
                // Завантажуємо URL апокаліпсисів
                if (Directory.Exists(_apocalypseImagesPath))
                {
                    foreach (var file in Directory.GetFiles(_apocalypseImagesPath))
                    {
                        var id = Path.GetFileNameWithoutExtension(file);
                        var url = $"/uploads/apocalypses/{Path.GetFileName(file)}";
                        _apocalypseImageUrls[id] = url;
                    }
                    _logger.LogInformation($"Завантажено {_apocalypseImageUrls.Count} зображень апокаліпсисів");
                }
                
                // Завантажуємо URL бункерів
                if (Directory.Exists(_bunkerImagesPath))
                {
                    foreach (var file in Directory.GetFiles(_bunkerImagesPath))
                    {
                        var id = Path.GetFileNameWithoutExtension(file);
                        var url = $"/uploads/bunkers/{Path.GetFileName(file)}";
                        _bunkerImageUrls[id] = url;
                    }
                    _logger.LogInformation($"Завантажено {_bunkerImageUrls.Count} зображень бункерів");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Помилка завантаження існуючих зображень");
            }
        }
        
        /// <summary>
        /// Санітизація ID для безпечного використання як імені файлу
        /// </summary>
        private string SanitizeId(string id)
        {
            if (string.IsNullOrEmpty(id)) return "unknown";
            
            // Видаляємо небезпечні символи
            var sanitized = new string(id.Where(c => 
                char.IsLetterOrDigit(c) || c == '_' || c == '-').ToArray());
            
            return string.IsNullOrEmpty(sanitized) ? "unknown" : sanitized.ToLowerInvariant();
        }
        
        /// <summary>
        /// Отримати URL зображення апокаліпсису
        /// </summary>
        public string? GetApocalypseImageUrl(string apocalypseId)
        {
            var sanitizedId = SanitizeId(apocalypseId);
            return _apocalypseImageUrls.TryGetValue(sanitizedId, out var url) ? url : null;
        }
        
        /// <summary>
        /// Отримати URL зображення бункера
        /// </summary>
        public string? GetBunkerImageUrl(string bunkerId)
        {
            var sanitizedId = SanitizeId(bunkerId);
            return _bunkerImageUrls.TryGetValue(sanitizedId, out var url) ? url : null;
        }
        
        /// <summary>
        /// Зберегти зображення апокаліпсису
        /// </summary>
        public async Task<(bool success, string? error, string? imageUrl)> SaveApocalypseImage(
            string apocalypseId, Stream imageStream, string originalFileName)
        {
            return await SaveImage(apocalypseId, imageStream, originalFileName, 
                _apocalypseImagesPath, _apocalypseImageUrls, "apocalypses");
        }
        
        /// <summary>
        /// Зберегти зображення бункера
        /// </summary>
        public async Task<(bool success, string? error, string? imageUrl)> SaveBunkerImage(
            string bunkerId, Stream imageStream, string originalFileName)
        {
            return await SaveImage(bunkerId, imageStream, originalFileName, 
                _bunkerImagesPath, _bunkerImageUrls, "bunkers");
        }
        
        private async Task<(bool success, string? error, string? imageUrl)> SaveImage(
            string itemId, Stream imageStream, string originalFileName,
            string basePath, Dictionary<string, string> cache, string urlFolder)
        {
            try
            {
                // Валідація розширення
                var extension = Path.GetExtension(originalFileName)?.ToLowerInvariant();
                if (string.IsNullOrEmpty(extension) || !AllowedExtensions.Contains(extension))
                {
                    return (false, "Непідтримуваний формат файлу. Дозволено: jpg, jpeg, png, webp, gif", null);
                }
                
                // Валідація розміру
                if (imageStream.Length > MaxFileSize)
                {
                    return (false, "Файл занадто великий. Максимум 5 MB", null);
                }
                
                var sanitizedId = SanitizeId(itemId);
                var fileName = $"{sanitizedId}{extension}";
                var filePath = Path.Combine(basePath, fileName);
                
                // Видаляємо старий файл якщо є (з іншим розширенням)
                RemoveExistingFiles(basePath, sanitizedId);
                
                // Зберігаємо новий файл
                using (var fileStream = new FileStream(filePath, FileMode.Create))
                {
                    await imageStream.CopyToAsync(fileStream);
                }
                
                // Додаємо версію для оновлення кешу браузера
                var imageUrl = $"/uploads/{urlFolder}/{fileName}?v={DateTime.UtcNow.Ticks}";
                cache[sanitizedId] = imageUrl;
                
                _logger.LogInformation($"Зображення збережено: {filePath}");
                
                return (true, null, imageUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Помилка збереження зображення для {itemId}");
                return (false, "Помилка збереження файлу", null);
            }
        }
        
        /// <summary>
        /// Видалити існуючі файли з таким ID (для заміни)
        /// </summary>
        private void RemoveExistingFiles(string basePath, string sanitizedId)
        {
            try
            {
                foreach (var ext in AllowedExtensions)
                {
                    var oldPath = Path.Combine(basePath, $"{sanitizedId}{ext}");
                    if (File.Exists(oldPath))
                    {
                        File.Delete(oldPath);
                        _logger.LogInformation($"Видалено старий файл: {oldPath}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, $"Не вдалося видалити старі файли для {sanitizedId}");
            }
        }
        
        /// <summary>
        /// Видалити зображення апокаліпсису
        /// </summary>
        public bool RemoveApocalypseImage(string apocalypseId)
        {
            var sanitizedId = SanitizeId(apocalypseId);
            RemoveExistingFiles(_apocalypseImagesPath, sanitizedId);
            return _apocalypseImageUrls.Remove(sanitizedId);
        }
        
        /// <summary>
        /// Видалити зображення бункера
        /// </summary>
        public bool RemoveBunkerImage(string bunkerId)
        {
            var sanitizedId = SanitizeId(bunkerId);
            RemoveExistingFiles(_bunkerImagesPath, sanitizedId);
            return _bunkerImageUrls.Remove(sanitizedId);
        }
        
        /// <summary>
        /// Оновити URL зображення в об'єкті апокаліпсису
        /// </summary>
        public void UpdateApocalypseImageUrl(Apocalypse? apocalypse)
        {
            if (apocalypse == null) return;
            apocalypse.ImageUrl = GetApocalypseImageUrl(apocalypse.Id);
        }
        
        /// <summary>
        /// Оновити URL зображення в об'єкті бункера
        /// </summary>
        public void UpdateBunkerImageUrl(BunkerInfo? bunker)
        {
            if (bunker == null) return;
            bunker.ImageUrl = GetBunkerImageUrl(bunker.Id);
        }
    }
}
