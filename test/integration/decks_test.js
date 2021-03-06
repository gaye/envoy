var Deck = require('./lib/deck'),
    DeckBuilder = require('./lib/deckbuilder'),
    Decks = require('./lib/decks'),
    Q = require('q'),
    url = require('url');

describe('decks', function() {
  var deckbuilder, decks;

  before(function() {
    deckbuilder = new DeckBuilder();
    decks = new Decks();
  });

  beforeEach(function() {
    return decks.launch();
  });

  it('list should be initially empty', function() {
    return decks
      .getAll()
      .then(function(list) {
        assert.lengthOf(list, 0);
      });
  });

  it('should list deck after deck save', function() {
    return deckbuilder
      .launch()
      .then(function() {
        return deckbuilder.cardpool();
      })
      .then(function(cards) {
        var clickPurple =
          _.find(cards, function(card) {
            return card.color === 'purple';
          })
          .click();
        var clickWhite =
          _.find(cards, function(card) {
            return card.color === 'white';
          })
          .click();
        return Q.all([clickPurple, clickWhite]);
      })
      .then(function() {
        return deckbuilder.setName('Four on Six');
      })
      .then(function() {
        return decks.launch();
      })
      .then(function() {
        return decks
          .getAll()
          .then(function(list) {
            assert.lengthOf(list, 1);
            var deck = list[0];
            assert.instanceOf(deck, Deck);
            assert.strictEqual(deck.name, 'Four on Six');
            assert.strictEqual(deck.cards, 2);
            assert.isArray(deck.colors);
            assert.include(deck.colors, 'purple');
            assert.include(deck.colors, 'white');
            assert.lengthOf(deck.colors, 2);
          });
      });
  });

  it('should load deck in deckbuilder on click', function() {
    return deckbuilder
      .launch()
      .then(function() {
        return deckbuilder.cardpool();
      })
      .then(function(cards) {
        var clickPurple =
          _.find(cards, function(card) {
            return card.color === 'purple';
          })
          .click();
        var clickWhite =
          _.find(cards, function(card) {
            return card.color === 'white';
          })
          .click();
        return Q.all([clickPurple, clickWhite]);
      })
      .then(function() {
        return deckbuilder.setName('Four on Six');
      })
      .then(function() {
        return decks.launch();
      })
      .then(function() {
        // Click on the deck.
        return decks
          .getAll()
          .then(function(list) {
            // Clicking the deck should "launch" the deckbuilder.
            var deck = list[0];
            return deck.click();
          })
          .then(function() {
            return Q
              .all([
                deckbuilder.getName(),
                driver.getCurrentUrl()
              ])
              .spread(function(name, currentUrl) {
                var pathname = url.parse(currentUrl).pathname;
                assert.strictEqual(name, 'Four on Six');
                assert.strictEqual(pathname, '/decks/Four%20on%20Six/');
              });
          });
      });
  });
});
