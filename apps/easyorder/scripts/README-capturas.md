# Capturas de la ayuda

Las imágenes de `/ayuda` (`apps/easyorder/public/ayuda/<nombre>-escritorio.png` y `-movil.png`) las
genera `scripts/capturas-ayuda.cjs` con Playwright. Se sacan de un entorno **local y desechable**
con datos inventados. Nunca se apuntan a producción ni a los datos de un restaurante real.

- Escritorio: 1360 × 900, tema claro.
- Móvil: iPhone 13 (390 × 844) con densidad 2, tema claro.

## Qué se necesita

- PostgreSQL local con permiso para crear una base.
- Playwright con Chromium (`pnpm dlx playwright install chromium` si falta).
- Los datos de demostración: `scripts/capturas/demo.sql`.
- Una API de pruebas que acepta tokens falsos: `scripts/capturas/api-falsa.ts`. Es un fichero
  auxiliar: se copia a `apps/api/src/zz-dev-visual.ts` mientras se hacen las capturas y **se borra
  después**. No se sube al repositorio.

## Pasos

Desde la raíz del repositorio. `DATABASE_URL` apunta a la base desechable (no pongas credenciales
en ningún fichero del repositorio).

1. Crear la base desechable y las tablas:

   ```bash
   createdb konnecttia_visual
   export DATABASE_URL=postgresql://USUARIO@localhost:5432/konnecttia_visual
   bash infra/scripts/migrate.sh
   ```

2. Cargar los datos de pruebas de la API y después los de demostración:

   ```bash
   psql "$DATABASE_URL" -f apps/api/test/fixtures.sql
   psql "$DATABASE_URL" -f apps/easyorder/scripts/capturas/demo.sql
   ```

   Los pedidos de demostración usan fechas relativas a «ahora», así que las capturas salen igual
   cualquier día.

3. Arrancar la API falsa en el puerto 3001:

   ```bash
   cp apps/easyorder/scripts/capturas/api-falsa.ts apps/api/src/zz-dev-visual.ts
   cd apps/api && pnpm exec tsx src/zz-dev-visual.ts &
   ```

4. Construir y arrancar la web en el puerto 3020, apuntando a esa API y a un Supabase falso (la
   sesión se simula en el navegador):

   ```bash
   cd apps/easyorder
   SUPABASE_URL=https://visualtest.supabase.co SUPABASE_ANON_KEY=fake \
     API_URL=http://127.0.0.1:3001 API_PUBLIC_URL=http://127.0.0.1:3001 pnpm build
   SUPABASE_URL=https://visualtest.supabase.co SUPABASE_ANON_KEY=fake \
     API_URL=http://127.0.0.1:3001 API_PUBLIC_URL=http://127.0.0.1:3001 pnpm exec next start -p 3020 &
   ```

5. Generar las capturas:

   ```bash
   node apps/easyorder/scripts/capturas-ayuda.cjs
   ```

   Para repetir solo algunas: `SOLO=pedidos-tablero,mesas-plano node apps/easyorder/scripts/capturas-ayuda.cjs`.

6. **Revisar cada imagen a ojo**: que no esté vacía, cortada ni muestre un error, y que no salga
   ningún dato real.

7. Parar los servidores y borrar el fichero temporal:

   ```bash
   fuser -k 3001/tcp 3020/tcp
   rm apps/api/src/zz-dev-visual.ts
   ```

## Si cambia la pantalla de un paso

Cada captura es una entrada de `SHOTS` en `capturas-ayuda.cjs` (nombre, quién entra y qué hace antes
de fotografiar). Si la pantalla cambia, ajusta esa entrada y vuelve a ejecutar con `SOLO=`. Los
nombres de los ficheros son los de `shot.file` en `src/lib/ayuda/content/*.ts`; un test comprueba que
todas las imágenes que usa la ayuda existen.
