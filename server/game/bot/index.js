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
        'Control the Weak',
        'Control the Weak',
        'Control the Weak',
        'Control the Weak',
        'Control the Weak',
        'Control the Weak',
        'Control the Weak',
        'Control the Weak',
        'Control the Weak'
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

        console.log(promptState);

        this.menuTitle = prompt.menuTitle;
        this.source = promptState.base.source ? promptState.base.source.name : undefined;
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
            this.action.selectedCard = this.card;
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
            actionSelectedCard: this.action.selectedCard,
            actionButton: this.action.button
        };
    }
}

class GameStateRecord {
    constructor(game) {
        this.game = game;
        Object.assign(this, this.relevantState(game));
    }
    // Enough state to make ai value judgements on previous actions
    relevantCardState(cardlist) {
        let relevant = [];
        if (!cardlist) {
            return {};
        }
        for (let card of cardlist) {
            relevant.push({
                name: card.name,
                type: card.type,
                uuid: card.uuid,
                tokens: card.tokens,
                traits: card.getTraits(),
                printedHouse: card.printedHouse, // Not really need for ai but helpful for debug
                houses: card.getHouses(),
                power: card.power,
                armor: card.armor,
                stunnded: card.stunned,
                exhausted: card.exhausted,
                upgrades: this.relevantCardState(card.upgrades),
                actions: card.getActions(),
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
        data.deckSize = player.deckCards.length;
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
        return data;
    }
    debug() {
        let data = {};
        for (let key in this) {
            if (key === 'game') {
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
    debugCard(card, locationController) {
        let data = card.name + '(';
        for (let key in card) {
            if (key === 'actions' || key === 'name' || key === 'uuid' || key === 'printedHouse') {
                continue;
            }
            if (key === 'controller' && card[key] === locationController) {
                continue;
            }
            if (key === 'houses') {
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

    menuButton(playerName, arg, uuid, method) {
        let player = this.getPlayerByName(playerName);
        if (!player) {
            return false;
        }

        this.actionRecord.push(
            new ActionRecordItem(player, {
                arg: arg
            })
        );

        // check to see if the current step in the pipeline is waiting for input
        let success = this.pipeline.handleMenuCommand(player, arg, uuid, method);
        this.actionRecord.push(new GameStateRecord(this));
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

        this.actionRecord.push(
            new ActionRecordItem(player, {
                card: card
            })
        );

        // Check to see if the current step in the pipeline is waiting for input
        this.pipeline.handleCardClicked(player, card);

        this.actionRecord.push(new GameStateRecord(this));
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
        this.actionRecord.push(new GameStateRecord(this));
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
