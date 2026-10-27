# GymCrew V2 — installation OVH

1. **Sauvegarder** le dossier actuel `a7xkroqqw9` et le fichier `config.js` sur votre PC.
2. Dans Supabase > SQL Editor, exécuter `migration_v2.sql` (une fois). Cela ajoute uniquement la lecture des pseudos du groupe. Les tables et performances existantes restent en place.
3. Décompresser ce ZIP et envoyer les fichiers dans `a7xkroqqw9` en remplaçant les anciens. **Conserver votre `config.js` actuel** (URL et clé publique). Le ZIP n'inclut pas de configuration privée.
4. Sur téléphone : fermer et rouvrir l'application. Si l'ancienne interface persiste, recharger la page dans Chrome. Le cache du service worker est versionné V2.
5. Tester : ouvrir la même séance sur deux appareils, enregistrer une série sur l'un, patienter 15 secondes sur l'autre. Les charges du groupe s'affichent sur la fiche de l'exercice.

## Points importants
- Chacun enregistre ses propres séries ; on ne modifie pas les données des amis.
- La synchronisation est automatique toutes les 15 secondes lorsque l'application est visible et au retour au premier plan (pas du temps réel instantané).
- L'écran affiche la **dernière série enregistrée** par personne et exercice, pas un record.
- Les comptes anonymes restent liés au navigateur. Ne pas effacer ses données sans solution de récupération.
- La mensuration de bras reste locale à l'appareil ; les séries sont synchronisées via Supabase.
- Les charges d'haltères sont exprimées par haltère, les dips en charge ajoutée.
