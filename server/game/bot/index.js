const _ = require('underscore');
const Game = require('../game');
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

class ActionRecordItem {
    constructor(player, data) {
        Object.assign(this, {
            playerName: player.name,
            menuTitle: 'undefined',
            buttons: [],
            source: undefined,
            action: {
                type: undefined,
                selectedCards: [],
                selectedCard: undefined,
                button: undefined
            }
        });

        let promptState = player.promptState;
        let prompt = player.currentPrompt();

        this.menuTitle = prompt.menuTitle;
        if (promptState.base) {
            this.source = promptState.base.source ? promptState.base.source.name : undefined;
        } else {
            this.source = undefined;
        }
        this.buttons = _.map(prompt.buttons, (button) => {
            return button.text;
        });
        if (data.arg != undefined) {
            this.action.type = 'button';
            let buttonClicked = _.filter(prompt.buttons, (button) => {
                return button.arg == data.arg;
            });
            if (buttonClicked.length > 0) {
                this.action.button = buttonClicked[0].text;
            }
        } else if (data.card) {
            this.action.type = 'card';
            this.action.selectedCard = data.card;
        }
        this.action.selectedCards = promptState.selectedCards;
    }

    debug() {
        return {
            playerName: this.playerName,
            menuTitle: this.menuTitle,
            buttons: this.buttons,
            source: this.source,
            actionType: this.action.type,
            actionSelectedCards: this.action.selectedCards,
            actionSelectedCard: this.action.selectedCard
                ? this.action.selectedCard.name
                : undefined,
            actionButton: this.action.button
        };
    }
}

class GameStateRecord {
    constructor(game) {
        this.game = game;
        Object.assign(this, this.relevantState(game));
    }
    scorePlayer(relevantPlayerData) {
        let s = 0;
        let forgebase = 3;
        let forgescale = 1.2;
        let now = 3; // Multiply times values that we currently have locked
        let soon = 2; // Multiply times values we can get next turn
        let later = 1; // Multiply times values that are elusive
        s += forgebase ** (relevantPlayerData.forged * forgescale);
        s += (relevantPlayerData.amber / relevantPlayerData.keyCost) * 6 * now;
        let houses = {};
        for (let card of relevantPlayerData.hand) {
            console.log(card);
            for (let house of card.houses) {
                let sc = 1 * soon;
                houses[house] = houses[house] ? houses[house] + sc : sc;
            }
        }
        for (let card of relevantPlayerData.archived) {
            for (let house of card.houses) {
                let sc = 1 * later;
                houses[house] = houses[house] ? houses[house] + sc : sc;
            }
        }
        for (let card of relevantPlayerData.cardsInPlay) {
            for (let house of card.houses) {
                let sc = 1 * later;
                houses[house] = houses[house] ? houses[house] + sc : sc;
            }
        }
        if (houses) {
            s += Math.max(...Object.values(houses));
        }
        return s;
    }
    // Enough state to make ai value judgements on previous actions
    relevantCardState(cardlist) {
        let relevant = [];
        if (!cardlist) {
            return [];
        }
        for (let card of cardlist) {
            relevant.push({
                name: card.name,
                type: card.type,
                uuid: card.uuid,
                tokens: card.tokens,
                traits: card.getTraits(),
                houses: card.getHouses(),
                power: card.power,
                armor: card.armor,
                stunnded: card.stunned,
                exhausted: card.exhausted,
                upgrades: this.relevantCardState(card.upgrades),
                controller: card.getModifiedController().name,
                leftFlank: card.isOnFlank('left'),
                rightFlank: card.isOnFlank('right'),
                center: card.isInCenter()
            });
        }
        return relevant;
    }
    relevantPlayerState(player) {
        let data = {};
        data.hand = this.relevantCardState(player.hand);
        data.cardsInPlay = this.relevantCardState(player.cardsInPlay);
        data.deckSize = player.deck.length;
        data.discard = this.relevantCardState(player.discard);
        data.purged = this.relevantCardState(player.purged);
        data.archived = this.relevantCardState(player.archived);
        data.chains = player.chains;
        data.activeHouse = player.activeHouse;
        data.keysForgedThisRound = player.keysForgedThisRound;
        data.forged = player.getForgedKeys();
        data.keyCost = player.getCurrentKeyCost();
        data.amber = player.amber;
        return data;
    }
    relevantState(game) {
        let data = {};
        for (let player of game.getPlayers()) {
            data[player.name] = this.relevantPlayerState(player);
        }
        data.winner = game.winner ? game.winner.name : undefined;
        data.activePlayer = game.activePlayer ? game.activePlayer.name : undefined;
        data.activePlayerActions = this.activePlayerActions();
        data.player1.score = this.scorePlayer(data.player1);
        data.player2.score = this.scorePlayer(data.player2);
        data.player1.scoreDelta = data.player1.score - data.player2.score;
        data.player2.scoreDelta = data.player2.score - data.player1.score;
        return data;
    }
    activePlayerActions() {
        let actions = [];
        if (!game.activePlayer) {
            return ['no active player'];
        }
        for (let location of [
            game.activePlayer.hand,
            game.activePlayer.archives,
            game.activePlayer.cardsInPlay,
            game.activePlayer.deck,
            game.activePlayer.purged
        ]) {
            for (let card of location) {
                actions = actions.concat(card.getLegalActions(game.activePlayer));
            }
        }
        // Maybe insert event triggers here
        // Maybe prune for card actions that can't be taken if that is not already covered
        return actions;
    }
    debug() {
        let data = {};
        for (let key in this) {
            if (key === 'game') {
                continue;
            }
            if (key === 'activePlayerActions') {
                data[key] = this.debugActions(this[key]);
                continue;
            }
            data[key] = this[key];
            if (key === 'player1' || key === 'player2') {
                for (let key2 in this[key]) {
                    if (
                        key2 === 'hand' ||
                        key2 === 'cardsInPlay' ||
                        key2 === 'purged' ||
                        key2 === 'archived' ||
                        key2 === 'discard'
                    ) {
                        data[key][key2] = _.map(this[key][key2], (card) =>
                            this.debugCard(card, key)
                        );
                    }
                }
            }
        }
        return data;
    }
    debugActions(actions) {
        let results = [];
        let cards = {};
        let i = 0;
        for (let action of actions) {
            let ci = i;
            if (action.card.uuid in cards) {
                ci = cards[action.card.uuid];
            } else {
                cards[action.card.uuid] = i;
                i += 1;
            }
            results.push(
                '' + ci + ' ' + action.card.name + '[' + action.card.location + ']:' + action.title
            );
        }
        return results;
    }
    debugCard(card, locationController) {
        let data = card.name + '(';
        for (let key in card) {
            if (key === 'actions' || key === 'name' || key === 'uuid') {
                continue;
            }
            if (key === 'controller' && card[key] === locationController) {
                continue;
            }
            if (
                card[key] == 0 ||
                card[key] == false ||
                key === 'type' ||
                card[key] == {} ||
                card[key] == []
            ) {
                continue;
            }
            if (key === 'upgrades') {
                data +=
                    'upgrades(' +
                    _.map(card[key], (upgrade) => {
                        return this.debugCard(upgrade, locationController);
                    }).join(',') +
                    '), ';
                continue;
            }
            if (card[key] == true) {
                data += key + ', ';
                continue;
            }
            if (key === 'tokens') {
                let tokens = this.debugTokens(card[key]);
                if (tokens.length <= 2) {
                    continue;
                }
                data += ' ' + tokens + ', ';
                continue;
            }
            data += key + '-' + card[key] + ', ';
        }
        return data.slice(0, data.length) + ')';
    }
    debugTokens(tokens) {
        let data = '[';
        for (let key in tokens) {
            if (tokens[key] == 0 || !tokens[key]) {
                continue;
            }
            data += key + ':' + tokens[key] + ' ';
        }
        return data.slice(0, data.length) + ']';
    }
}

class RecordGame extends Game {
    constructor() {
        super({
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

let game = new RecordGame();
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
