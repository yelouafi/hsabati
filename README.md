# Hsabati

Une petite app pour suivre l'argent reçu et dépensé, en deux secondes.
Elle s'installe sur le téléphone comme une vraie app (PWA), marche hors ligne
et garde les données sur le téléphone.

- **Caisses** : l'argent arrive dans une caisse (ex. Maison, Investissement).
  Chaque caisse affiche **Reçu · Dépensé · Solde**.
- **Postes** : on dépense sur un poste d'une caisse (Alimentation, Maison
  Tulip…), avec un budget facultatif.
- **Saisie express** : l'app s'ouvre sur le pavé numérique, en mode
  **Dépense** (dernier poste déjà choisi) ; un bouton **Recette** pour l'argent
  reçu.
- **Importer mes notes** : collez vos notes ; les titres deviennent des postes
  (« Dépenses Tulip » → Tulip), une ligne « Recettes » fait passer les montants
  suivants en recettes, et les montants sont reconnus (`1500`, `1 200,50 dh`,
  `300+150`, `1,5k`…).
- **Sauvegarde** : un fichier à envoyer sur Google Drive / WhatsApp, export CSV
  pour Excel, restauration.

## Installation sur Android

1. Ouvrir l'adresse de l'app dans **Chrome**.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. L'icône apparaît sur l'écran d'accueil. Un appui long dessus donne un raccourci
   « Nouvelle dépense ».

## Développement

Vite 7 + Preact + TypeScript, état partagé avec `@preact/signals`, mode hors
ligne généré par `vite-plugin-pwa` (Workbox).

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # tests du parseur de montants (Vitest)
npm run build      # vérification TypeScript + build dans dist/
npm run preview    # sert dist/ (avec le service worker)
```

Organisation :

- `src/lib/` : données (`store.ts`, IndexedDB dans `db.ts`), parseur de notes,
  navigation / feuilles / toast (`ui.ts`), service worker (`sw.ts`)
- `src/screens/` : Ajouter (dépense / recette), Caisses (liste, caisse, poste), Réglages
- `src/components/` : icônes, anneau de budget, feuilles (poste, caisse, choix, import)

Dans le code : `Fund` = caisse, `Project` = poste, `Income` = recette,
`Expense` = dépense (voir `src/lib/types.ts`).

## Déploiement (GitHub Pages)

Une fois : dans *Settings → Pages* du dépôt, choisir **Source : GitHub Actions**.
Ensuite chaque push sur `main` lance les tests, le build, et publie `dist/` sur
`https://<utilisateur>.github.io/hsabati/`.

Les téléphones récupèrent la nouvelle version en arrière-plan et l'affichent au
lancement suivant.

## Données

Tout est stocké dans IndexedDB sur le téléphone. Les enregistrements ont un
`id` et un `updatedAt`, et les suppressions sont « douces » (`deleted: true`) :
la restauration fusionne par id en gardant le plus récent, et c'est la même
logique qui servira pour la synchronisation Google Drive.
