describe('Bot player', function () {
    describe('bot player plays cards', function () {
        beforeEach(function () {
            this.setupTest({
                player1: {
                    house: 'dis',
                    hand: ['a-fair-game', 'pitlord', 'arise', 'dextre', 'doc-bookton'],
                    discard: ['tocsin', 'batdrone']
                },
                player2: {
                    hand: ['mighty-tiger', 'snufflegator', 'inka-the-spider', 'sequis'],
                    discard: ['flaxia', 'nexus']
                }
            });
        });

        it('should choose house based on cards + board', function () {
            this.player1.moveCard(this.tocsin, 'deck');
            this.player2.moveCard(this.flaxia, 'deck');
            this.player1.play(this.aFairGame);
            this.player1.endTurn();
            this.player2.player.botRespond();
            expect(this.player2.player.activeHouse).toBe('untamed');
            this.player2.play(this.mightyTiger);
            this.player2.play(this.snufflegator);
            this.player2.play(this.inkaTheSpider);
            this.player2.endTurn();
            this.player1.clickPrompt('Dis');
            this.player1.endTurn();
            this.player2.player.botRespond();
            expect(this.player2.player.activeHouse).toBe('untamed');
        });
    });
});
