// Bubble's standalone popup normally creates children on open and destroys
// them after close. This adapter belongs to one library-owned native instance.
// It preserves Bubble's own layout and never modifies the registered class.
export function retainBubblePopup(card) {
  if (!card?.isStandalonePopUp || typeof card._standalonePopUpCardsActive !== 'boolean' || !Array.isArray(card.config?.cards) ||
      typeof card.updateBubbleCard !== 'function' || !card.shadowRoot ||
      !card.popUp || card.popUp.parentNode !== card.shadowRoot ||
      typeof card.shadowRoot.removeChild !== 'function') {
    throw Error('Diese Bubble-Card-Implementierung unterstützt das Vorladen nicht. Das Popup wird weiterhin beim Öffnen geladen.');
  }
  const flag = '_standalonePopUpCardsActive', parent = card.shadowRoot;
  const activeDescriptor = Object.getOwnPropertyDescriptor(card, flag);
  const removeDescriptor = Object.getOwnPropertyDescriptor(parent, 'removeChild');
  if (activeDescriptor && (!activeDescriptor.configurable || activeDescriptor.get || activeDescriptor.set) ||
      removeDescriptor && !removeDescriptor.configurable) {
    throw Error('Bubble Card kann für diese Popup-Instanz nicht sicher vorbereitet werden.');
  }
  const removeChild = parent.removeChild;
  let released = false, requestedActive = card[flag];
  const restore = () => {
    if (released) return;
    released = true;
    if (activeDescriptor) Object.defineProperty(card, flag, {...activeDescriptor, value: requestedActive});
    else { delete card[flag]; card[flag] = requestedActive; }
    if (removeDescriptor) Object.defineProperty(parent, 'removeChild', removeDescriptor);
    else delete parent.removeChild;
  };
  try {
    Object.defineProperty(card, flag, {configurable: true, enumerable: activeDescriptor?.enumerable ?? true,
      get: () => released ? requestedActive : true, set: value => { requestedActive = value; }});
    // Bubble 3.4 also detaches the closed shell. Keep only this exact native
    // overlay connected; all other removeChild calls retain normal DOM behavior.
    Object.defineProperty(parent, 'removeChild', {configurable: true, writable: true,
      value(child) { return !released && child === card.popUp ? child : removeChild.call(this, child); }});
    card.updateBubbleCard();
    if (card.config.cards.length && (!Array.isArray(card._managedCards) || card._managedCards.length !== card.config.cards.length || card._managedCards.some(child => !child))) {
      throw Error('Bubble Card hat die angeforderten Unterkarten nicht vorbereitet. Das Popup wird weiterhin beim Öffnen geladen.');
    }
  } catch (error) { restore(); throw error; }
  return {release: restore, get released() { return released; }};
}
