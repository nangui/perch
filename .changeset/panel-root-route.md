---
"@perchjs/nest": minor
---

Answer at the panel's own address. Every page route named a resource, so a panel mounted at `/admin` served nothing at `/admin`: the address an application advertises, the one a browser is left at after a sign-in and the one somebody pastes into a message was the one address of the panel that answered 404. It now sends the reader to the first entry their own menu offers, built per request and filtered by what they may reach, so two readers can land in two places and one who may reach nothing gets a 404 rather than a panel telling them it is empty. A 302 and never cached, because the answer depends on who asked.
