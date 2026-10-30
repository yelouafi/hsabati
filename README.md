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

Aucune dépendance ni étape de build : c'est du HTML/CSS/JS dans `app/`.

```sh
npm test                                  # tests du parseur de montants
cd app && python3 -m http.server 8000    # puis http://localhost:8000
```

Le service worker ne s'active qu'en HTTPS ; en local l'app marche sans
mode hors ligne.

## Déploiement (GitHub Pages)

Une fois : dans *Settings → Pages* du dépôt, choisir **Source : GitHub Actions**.
Ensuite chaque push sur `main` publie `app/` sur
`https://<utilisateur>.github.io/hsabati/`.

Les téléphones récupèrent la nouvelle version en arrière-plan et l'affichent au
lancement suivant.

## Données

Tout est stocké dans IndexedDB sur le téléphone. Les enregistrements ont un
`id` et un `updatedAt`, et les suppressions sont « douces » (`deleted: true`) :
la restauration fusionne par id en gardant le plus récent, et c'est la même
logique qui servira pour la synchronisation Google Drive.
