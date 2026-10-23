                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                margin: '12px auto',
                padding: '8px',
                cursor: 'pointer',
                color: '#f4d68a',
                background: 'transparent',
                backgroundColor: 'transparent',
                backgroundImage: 'none',
                border: 'none',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none'
              }}
            >
              <svg
                viewBox="0 0 100 100"
                aria-hidden="true"
                style={{
                  display: 'block',
                  width: '100px',
                  height: '100px',
                  background: 'transparent',
                  backgroundColor: 'transparent'
                }}
              >
                <g fill="#238636" stroke="#d7b65e" strokeWidth="2">
                  <ellipse cx="50" cy="25" rx="13" ry="19" />
                  <ellipse cx="72" cy="41" rx="13" ry="19" transform="rotate(72 72 41)" />
                  <ellipse cx="64" cy="66" rx="13" ry="19" transform="rotate(144 64 66)" />
                  <ellipse cx="36" cy="66" rx="13" ry="19" transform="rotate(216 36 66)" />
                  <ellipse cx="28" cy="41" rx="13" ry="19" transform="rotate(288 28 41)" />
                </g>
                <path
                  d="M50 58 Q53 78 39 94"
                  fill="none"
                  stroke="#d7b65e"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
              <span
                style={{
                  color: '#f4d68a',
                  background: 'transparent',
                  backgroundColor: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  letterSpacing: '2px'
                }}
              >
                BINGO!
              </span>
            </button>
          </section>

          <div className="cards">
            {cards.map(card => (
              <article className="bcard" key={card.id}>
                <h3>Card {card.card_number}</h3>

                <div className="grid">
                  {letters.map(letter => (
                    <b key={letter}>{letter}</b>
                  ))}

                  {(Array.isArray(card.numbers) ? card.numbers : []).map(
                    (number, index) => {
                      const isFree = number === 'FREE';
                      const isCalled = !isFree && called.includes(number);

                      const isMarked =
                        isFree ||
                        (isCalled && Boolean(card.localMarks?.[index]));

                      return (
                        <button
                          key={index}
                          type="button"
                          className={[
                            isFree ? 'free' : '',
                            isMarked ? 'marked' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          disabled={!isFree && !isCalled}
                          onClick={() => toggleMark(card.id, index)}
                          title={
                            isFree
                              ? 'Free space'
                              : isCalled
                                ? 'Click to mark or unmark'
                                : 'Waiting for this number to be called'
                          }
                        >
                          {number}
                        </button>
                      );
                    }
                  )}
                </div>
              </article>
            ))}
          </div>

          <p className="hint">
            Card marks are saved in this browser tab's session. They are not
            shared with other players. Secure Bingo win verification still
            needs to be added.
          </p>

          {message && <p className="message">{message}</p>}
        </>
      )}

      <footer>Made for game night with Finger Family 💚</footer>
    </main>
  );
}
