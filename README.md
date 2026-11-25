# RaceLeague

Jeu de course contre-la-montre low-poly pour navigateur (PC et mobile). Circuits courts et techniques au-dessus des canyons, replays vérifiés par le serveur.

## Démarrer

```bash
npm install
npm run dev        # lance le jeu sur http://localhost:5173 (aussi accessible depuis un téléphone sur le même Wi-Fi)
npm test           # tests de déterminisme des replays (Node)
npm run replay     # rejoue les 3 replays de référence dans Node
npm run replay -- mon-replay.json   # rejoue un replay téléchargé depuis le jeu
npm run build      # build de production dans packages/client/dist
```

Commandes : flèches, ZQSD ou WASD pour conduire, R ou Retour arrière pour recommencer, Entrée pour relancer après l'arrivée. Échap ouvre le menu. Sur téléphone, des boutons tactiles s'affichent.

## Structure

| Dossier | Contenu |
| --- | --- |
| `packages/shared` | Simulation de la voiture (Rapier déterministe), circuits en données, format des replays, tests |
| `packages/client` | Rendu Three.js, contrôles clavier et tactiles, page de test des replays |
| `packages/server` | Pour l'instant : le script qui rejoue un replay. L'API du classement arrive en semaine 3 |

## Déterminisme

La même simulation tourne dans le navigateur et dans Node : un replay (la liste des changements de touches) doit donner exactement le même temps partout. Règles dans `packages/shared/src/sim.ts` :

- pas fixe de 1/60 s, aucune horloge, aucun hasard ;
- uniquement `+ − × ÷` et `sqrt` dans la simulation : `Math.sin`, `cos`, `atan`, `exp`, `pow` peuvent donner des résultats différents selon le navigateur ;
- toute la physique passe par `@dimforge/rapier3d-deterministic-compat`, même version partout.

Si le comportement de la voiture change, incrémenter `SIM_VERSION` puis régénérer les replays de référence avec `npm run fixtures`.

**Vérifier sur un appareil** : ouvrir `determinism.html` (lien « test des replays » en bas à droite du jeu). La page rejoue les 3 replays de référence et compare l'empreinte de l'état final à celle calculée par Node. Tout doit être vert sur PC, téléphone et Node.
