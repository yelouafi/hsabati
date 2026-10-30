# Hsabati

Une petite app pour noter ses dépenses par projet, en deux secondes.
Elle s'installe sur le téléphone comme une vraie app (PWA), marche hors ligne
et garde les données sur le téléphone.

- **Saisie express** : l'app s'ouvre directement sur le pavé numérique,
  le dernier projet est déjà sélectionné. Montant → Ajouter.
- **Projets & budgets** : progression, reste, dépassement.
- **Importer mes notes** : collez vos notes (`menuisier: 1500`, `plombier 800 dh`,
  `peinture 300+150`, `1 200,50`…), les projets et montants sont reconnus.
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
- `src/screens/` : Ajouter, Projets (liste et détail), Réglages
- `src/components/` : icônes, anneau de budget, feuilles (projet, choix, import)

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
