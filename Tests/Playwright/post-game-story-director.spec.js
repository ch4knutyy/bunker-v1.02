const { test, expect } = require('@playwright/test');

test.use({ ignoreHTTPSErrors: true });

const entry = {
  id: 'entry-public-1', mode: 'final_story', title: 'Остання варта', subtitle: 'Хроніка сховища',
  survivalScore: 62, verdictText: 'Шанс є, але ціна висока.', opening: 'Двері зачинилися.',
  chapters: [{ title: 'Перша зима', text: 'Група пережила холод.' }],
  survivorEpilogues: [{ playerName: 'Олена', fate: 'Вона врятувала медичний сектор.' }],
  eliminatedPlayerFates: [{ playerName: 'Тарас', usefulnessAssessment: 'Група втратила інженера.', fate: 'Він знайшов інше укриття.' }],
  finalSummary: 'Бункер вистояв.'
};

test('completion stays on the board before host decision and story request', async ({ page }) => {
  await page.goto('/Bunker');
  await page.evaluate(() => {
    isHost = true;
    currentGameCompletion = { bunkerCapacity: 1, survivorCount: 1, winners: [], completedAtRound: 3 };
    applyPostGameTransition({ phase: 'FinalDiscussion', canRevealRemainingCharacteristics: true, storyDirectorAvailable: true });
    renderGameFinished(currentGameCompletion);
  });
  await expect(page.locator('#postGameStoryRoot')).toBeHidden();
  await expect(page.locator('#finishPostGameDiscussionButton')).toBeVisible();
  await expect(page.locator('#createPostGameStoryButton')).toBeHidden();
  await expect(page.locator('#returnFinishedGameButton')).toBeHidden();

  await page.evaluate(() => applyPostGameTransition({ phase: 'HostDecision', developerPresent: true, storyDirectorAvailable: true }));
  await expect(page.locator('#createPostGameStoryButton')).toBeVisible();
  await expect(page.locator('#returnFinishedGameButton')).toBeVisible();
  await expect(page.locator('#postGameStoryRoot')).toHaveCount(1);

  await page.evaluate(() => {
    isHost = false;
    isDeveloper = false;
    applyPostGameTransition({ phase: 'StoryRequested', developerPresent: true, storyDirectorAvailable: true, requestedStoryMode: 'final_story' });
  });
  await expect(page.locator('#postGameStoryWaiting')).toBeVisible();
  await expect(page.locator('#postGameStoryDirector')).toBeHidden();
  await expect(page.locator('#postGameStoryWaitingCancel')).toBeHidden();
});

test('published story renders safe chapters, survivors and eliminated fates and can skip reveal', async ({ page }) => {
  await page.goto('/Bunker');
  await page.evaluate(value => { isHost = false; window.PostGameStoryDirector.showPresentation(value, {}); }, entry);
  await expect(page.locator('#postGameStoryTitle')).toHaveText('Остання варта');
  await expect(page.locator('#postGameStoryContent')).toContainText('Олена');
  await expect(page.locator('#postGameStoryContent')).toContainText('Тарас');
  await expect(page.locator('#postGameStoryContent')).toContainText('Група втратила інженера.');
  await page.locator('#postGameStoryShowAll').click();
  await expect(page.locator('.story-reveal:not(.is-visible)')).toHaveCount(0);
  await expect(page.locator('[data-story-mode]:visible')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('entry-public-1');
});

test('reconnect displays current entry immediately without replaying animation', async ({ page }) => {
  await page.goto('/Bunker');
  await page.evaluate(value => {
    isHost = false;
    window.PostGameStoryDirector.applyState({ status: 'awaiting_next_choice', currentEntryId: value.id, publishedEntries: [value] }, true);
  }, entry);
  await expect(page.locator('#postGameStoryPresentation')).toBeVisible();
  await expect(page.locator('.story-reveal:not(.is-visible)')).toHaveCount(0);
  await expect(page.locator('#postGameStoryReplay')).toBeVisible();
});
