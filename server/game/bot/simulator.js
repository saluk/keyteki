const _ = require('underscore');
const Game = require('../game');

const GameStateRecord = require('./gamestaterecord');
const ActionRecordItem = require('./ActionRecordItem');

const DeckBuilder = require('../../../test/helpers/deckbuilder');

const GameWonPrompt = require('../gamesteps/GameWonPrompt');

console.log('Building the game');

let deckBuilder = new DeckBuilder();

let user1 = {
    username: 'player1',
    settings: {
        optionSettings: {
            orderForcedAbilities: true
        }
    }
};

let user2 = {
    username: 'player2',
    settings: {
        optionSettings: {
            orderForcedAbilities: true
        }
    }
};

let dummydeck = deckBuilder.buildDeck(
    ['Dis', 'Logos', 'Shadows'],
    [
        'Control the Weak',
        'Ember Imp',
        'Shaffles',
        'Shaffles',
        'Dextre',
        'Dextre',
        'Wild Wormhole',
        'Library of Babble',
        'Skippy Timehog',
        'Bad Penny',
        'Urchin',
        'Urchin',
        'Macis Asp',
        'Macis Asp',
        'Gambling Den'
    ]
);

class RecordGame extends Game {
    constructor(options) {
        super(options);
        this.actionRecord = [];
    }

    /* Record the game state. If the last item is a gamestate, overwrite that one */
    recordGameState() {
        if (this.actionRecord[this.actionRecord.length - 1] instanceof GameStateRecord) {
            this.actionRecord[this.actionRecord.length - 1] = new GameStateRecord(this);
        } else {
            this.actionRecord.push(new GameStateRecord(this));
        }
    }

    recordAction(player, data) {
        let actionRecord = new ActionRecordItem(player, data);
        // We don't need to record our first click on a card, just what we do with it
        if (!actionRecord.source && actionRecord.action.type === 'card') {
            return;
        }
        this.actionRecord.push(actionRecord);
        return actionRecord;
    }

    menuButton(playerName, arg, uuid, method) {
        let player = this.getPlayerByName(playerName);
        if (!player) {
            return false;
        }

        this.recordGameState(); // Record state before action
        this.recordAction(player, { arg: arg });

        // check to see if the current step in the pipeline is waiting for input
        let success = this.pipeline.handleMenuCommand(player, arg, uuid, method);
        this.recordGameState(); // Record state after action
        return success;
    }
    cardClicked(sourcePlayer, cardId) {
        let player = this.getPlayerByName(sourcePlayer);

        if (!player) {
            return;
        }

        let card = this.findAnyCardInAnyList(cardId);

        if (!card) {
            return;
        }

        this.recordGameState(); // Record state before action
        let actionRecord = this.recordAction(player, { card: card });

        // Check to see if the current step in the pipeline is waiting for input
        this.pipeline.handleCardClicked(player, card);

        // If we didn't record the action, it probably doesn't change the game state
        if (actionRecord) {
            this.recordGameState(); // Record state after action
        }
    }
    recordWinner(winner, reason) {
        if (this.winner) {
            return;
        }

        this.addAlert('success', '{0} has won the game', winner);
        this.setWins(winner.name, winner.wins ? winner.wins + 1 : 1);
        this.winner = winner;
        this.finishedAt = new Date();
        this.winReason = reason;
        //this.router.gameWon(this, reason, winner);
        this.queueStep(new GameWonPrompt(this, winner));
        this.recordGameState();
    }
}

let game = new RecordGame({
    owner: user1,
    players: [
        {
            isBot: true,
            user: user1,
            id: 'player1',
            deck: dummydeck
        },
        {
            isBot: true,
            user: user2,
            id: 'player2',
            deck: dummydeck
        }
    ],
    spectators: []
});
game.started = true;
game.selectDeck('player1', dummydeck);
game.selectDeck('player2', dummydeck);
game.initialise();

//console.log(game);
game.continue();
game.simulate();
for (let action of game.actionRecord) {
    console.log(action.debug ? action.debug() : action);
}
