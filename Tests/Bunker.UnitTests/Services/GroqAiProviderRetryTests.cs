using System.Net;
using System.Text;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class GroqAiProviderRetryTests
{
    [Fact]
    public async Task Request_entity_too_large_retries_once_with_a_smaller_valid_context()
    {
        var handler = new SequencedHandler(
            new HttpResponseMessage(HttpStatusCode.RequestEntityTooLarge),
            JsonResponse("""{"choices":[{"message":{"content":"I can help."}}],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}"""));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AiChat:GroqApiKey"] = "test-key",
            ["AiChat:TimeoutSeconds"] = "10",
            ["AiChat:MaxCompletionTokens"] = "320"
        }).Build();
        var provider = new GroqAiProvider(new TestHttpClientFactory(handler), configuration,
            NullLogger<OpenAiCompatibleAiProvider>.Instance);
        var prompt = "You are Oleksii.\n{" +
            "\"CanonicalSelf\":{\"profession\":\"Engineer\"},\"GameSituation\":{},\"BehavioralProfile\":{},\"Conversation\":[],\"CurrentTask\":{},\"padding\":\"" +
            new string('x', 3000) + "\"}\n\nPresentation mode: reply briefly.";

        var result = await provider.GenerateReplyAsync(new AiChatCompanion { Provider = "Groq", Model = "openai/gpt-oss-120b" }, prompt, CancellationToken.None);

        Assert.Equal("I can help.", result.Text);
        Assert.Null(result.ErrorCode);
        Assert.Equal(2, handler.RequestBodies.Count);
        Assert.True(handler.RequestBodies[1].Length < handler.RequestBodies[0].Length);
        Assert.Equal(12, result.Usage?.InputTokens);
        Assert.Equal(8, result.Usage?.OutputTokens);
    }

    [Fact]
    public async Task Reasoning_only_and_length_limited_responses_are_reported_as_unusable()
    {
        var handler = new SequencedHandler(
            JsonResponse("""{"choices":[{"message":{"content":null,"reasoning":"internal work"}}],"usage":{"prompt_tokens":12,"completion_tokens":320,"completion_tokens_details":{"reasoning_tokens":320}}}"""),
            JsonResponse("""{"choices":[{"message":{"content":"An unfinished strategic point"},"finish_reason":"length"}],"usage":{"prompt_tokens":12,"completion_tokens":320,"total_tokens":332}}"""));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["AiChat:GroqApiKey"] = "test-key" }).Build();
        var provider = new GroqAiProvider(new TestHttpClientFactory(handler), configuration, NullLogger<OpenAiCompatibleAiProvider>.Instance);
        var companion = new AiChatCompanion { Provider = "Groq", Model = "openai/gpt-oss-120b" };

        var reasoningOnly = await provider.GenerateReplyAsync(companion, "Discussion mode: test", CancellationToken.None);
        var truncated = await provider.GenerateReplyAsync(companion, "Discussion mode: test", CancellationToken.None);

        Assert.Equal("ai_reasoning_exhausted", reasoningOnly.ErrorCode);
        Assert.Equal(320, reasoningOnly.Usage?.ReasoningTokens);
        Assert.Equal("ai_response_truncated", truncated.ErrorCode);
        Assert.Null(truncated.Text);
        Assert.Equal(2, handler.RequestBodies.Count);
    }

    private static HttpResponseMessage JsonResponse(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class TestHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class SequencedHandler(params HttpResponseMessage[] responses) : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> responses = new(responses);
        public List<string> RequestBodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestBodies.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
            return responses.Dequeue();
        }
    }
}
