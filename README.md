# GymCrew — version 1

Application mobile PWA pour enregistrer les séries de deux séances et comparer les charges entre amis.

## Tester immédiatement (démo locale)

1. Décompresser le ZIP.
2. Dans le dossier, lancer `python -m http.server 8000`.
3. Ouvrir `http://localhost:8000` sur l'ordinateur. Le mode démo conserve les données dans ce navigateur seulement.

## Activer le partage entre amis

1. Créer un projet gratuit sur https://supabase.com.
2. Dans **Authentication > Providers**, activer **Anonymous Sign-ins**.
3. Dans **SQL Editor**, exécuter le contenu de `supabase.sql`.
4. Dans **Project Settings > API**, copier l'URL du projet et la clé publique `anon` (ou publishable key compatible) dans `config.js`. **Ne jamais copier la clé service_role.**
5. Héberger tous les fichiers sur un site HTTPS (par exemple Netlify ou Cloudflare Pages). Ouvrir l'adresse sur chaque téléphone.
6. La première personne laisse le code vide pour créer le groupe, puis transmet le code affiché dans **Amis**. Les autres saisissent ce code et leur pseudo.
7. Sur Android Chrome, menu ⋮ > **Ajouter à l'écran d'accueil** / **Installer l'application**.

## Limites de cette V1

- L'authentification anonyme est attachée au navigateur. Effacer les données du navigateur ou changer de téléphone peut faire perdre l'accès au compte. Exporter régulièrement ses données.
- Cette version ne gère pas encore le renouvellement automatique des sessions expirées : si les enregistrements échouent après expiration, il faudra améliorer l'authentification avant une utilisation prolongée.
- Les mensurations restent locales. Les séries sont partagées si Supabase est configuré.
- Les performances sont comparées par charge maximale enregistrée, et non par force relative ou 1RM.
- Le programme est intégré dans le code. Les modifications communes se font par mise à jour de l'application.
- Il n'y a pas de récupération de compte ni de véritable rôle administrateur dans cette V1.
- Les exercices à risque de douleur doivent être adaptés selon la tolérance individuelle.

## Données

En mode local : `localStorage` du navigateur. En mode partagé : les séries sont enregistrées dans Supabase et protégées par des règles RLS réservant leur lecture aux membres du même groupe. Les pseudos sont uniques dans un groupe.
