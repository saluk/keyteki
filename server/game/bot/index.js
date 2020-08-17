const Game = require('../game');
const DeckBuilder = require('../../../test/helpers/deckbuilder');

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

let game = new Game({
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

console.log(game);
game.continue();
game.simulate();
