# GymCrew V4 — installation

1. Sauvegarder le dossier OVH et les tables Supabase. Ne pas supprimer les tables existantes.
2. Exécuter `migration_v4.sql` dans Supabase SQL Editor, APRÈS les migrations V2/V3.
3. Pour créer automatiquement le sondage chaque mercredi à 18h heure de Paris, activer l'extension `pg_cron` puis exécuter `automation_v4_optional.sql` une seule fois. Sans cela, utiliser « Créer le sondage » dans l'onglet Vendredi. Le sondage de la semaine en cours ne se crée pas rétroactivement.
4. Déployer les fichiers web sur OVH dans `a7xkroqqw9` en conservant **le config.js réel** contenant l'URL et la clé publique Supabase. Le `config.js` du ZIP est volontairement vide.
5. Fermer/réouvrir l'application installée pour renouveler le service worker. Tester avec deux comptes existants.

## Fonctions livrées
- Onglet Vendredi : choix multiples 18:00, 18:30, 19:00, 19:30 ou Absent ; modification des votes ; visibilité des votes du groupe ; résultats par créneau.
- Création manuelle du sondage, plus automatisation optionnelle Supabase Cron chaque mercredi 18h Europe/Paris.
- Préférences locales pour le rappel quotidien de créatine.

## Important : notifications push NON livrées
Cette version ne déclenche PAS de notifications système lorsque l'application est fermée. Les préférences créatine sont enregistrées uniquement sur le téléphone. Pour les notifications, il faut encore développer et déployer : abonnements Push par utilisateur, autorisation navigateur, clés VAPID conservées sur serveur, Edge Function d'envoi et tâches planifiées pour les rappels et les sondages. Ne jamais placer la clé privée VAPID ou une clé Supabase secrète dans le frontend.

## Limites
- Le calendrier utilise la date locale du téléphone ; les créneaux sont pour le vendredi suivant ou courant.
- L'authentification anonyme reste liée à chaque navigateur.
- Migration non testée contre le projet Supabase réel ; vérifier les règles RLS avec deux membres avant usage régulier.
