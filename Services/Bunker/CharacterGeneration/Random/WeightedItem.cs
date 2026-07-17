namespace Bunker.Services
{
	public class WeightedItem<T>
    {
        public T Value { get; set; } = default!;
        public int Weight { get; set; }
    }
}
