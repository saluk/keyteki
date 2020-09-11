const _ = require('underscore');
const util = require('util');

class ActionRecordItem {
    constructor(player, data) {
        this.action = {};
        this.playerName = null;
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
        if (!data) {
        }
        else if (data.arg != undefined) {
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

    debugString() {
        return util.inspect(this.debug());
    }
}

module.exports = ActionRecordItem;