# GymCrew V3 — déploiement OVH / Supabase

## Avant de commencer
- Faire une sauvegarde des fichiers V2 et exporter les tables Supabase si possible.
- Ne **pas** supprimer les tables `gym_groups`, `gym_members` ou `workout_sets` : l'historique et les comptes sont conservés.
- Garder le `config.js` du serveur : ce ZIP ne contient aucune clé.

## Installation
1. Dans Supabase > SQL Editor, exécuter `migration_v3.sql` **une seule fois** (après la migration V2).
2. Envoyer `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icon.svg` sur OVH dans le dossier du sous-domaine, en remplaçant les fichiers V2. Ne pas envoyer les SQL dans le dossier public.
3. Garder `config.js` actuel inchangé.
4. Fermer l'application puis rouvrir. Si l'ancien affichage reste en cache, actualiser la page ou vider uniquement le cache du site (ne pas supprimer les données locales, car les comptes anonymes en dépendent).

## Fonctionnalités
- Programme A/B historique conservé et sélectionné par défaut.
- Onglet Programmes : créer, modifier, supprimer ses propres programmes ; choisir ou dupliquer ceux des autres membres du groupe.
- Deux séances A et B par programme ; chaque exercice a son nombre de séries, plage de répétitions et charge initiale.
- Charges partagées sur les exercices communs ; chaque membre enregistre ses séries avec son propre compte.
- Historique conservé ; les anciens enregistrements ne sont pas modifiés par la personnalisation des programmes.
- Mensurations dans l'historique, enregistrées localement uniquement.

## Limites connues
- Le choix du programme est mémorisé sur l'appareil (pas synchronisé entre appareils).
- Deux séances A/B par programme pour rester compatible avec le schéma actuel `workout_sets.session`.
- Les historiques associent les séries au nom de l'exercice ; si deux programmes utilisent exactement le même nom, les charges sont communes pour cet exercice.
- La sauvegarde d'un programme existant remplace ses exercices en deux opérations : en cas d'erreur réseau entre les deux, il faudra le rééditer.
- L'authentification anonyme ne permet pas encore de récupérer un compte perdu.
- Tester avec un programme temporaire avant de remplacer la V2 pour tout le groupe.
