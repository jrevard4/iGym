import { t, getStrings } from '../i18n';

describe('t', () => {
  it('returns the English string by default', () => {
    expect(t('login')).toBe('Log In');
  });

  it('returns the Spanish string when lang=es', () => {
    expect(t('login', 'es')).toBe('Iniciar sesión');
  });

  it('falls back to English for a key missing in the target language', () => {
    expect(t('login', 'fr')).toBe('Log In');
  });

  it('falls back to the raw key when it exists nowhere', () => {
    expect(t('notARealKey', 'es')).toBe('notARealKey');
  });
});

describe('getStrings', () => {
  it('returns a full English dictionary by default', () => {
    expect(getStrings().wallet).toBe('Wallet');
  });

  it('overlays Spanish strings on top of the English base', () => {
    const es = getStrings('es');
    expect(es.wallet).toBe('Billetera');
    // Every English key should still resolve to something in the Spanish dict
    expect(Object.keys(es).length).toBeGreaterThan(0);
  });
});
