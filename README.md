# RAC Website (Ryu Acupuncture Clinic)

This is the official website for Ryu Acupuncture Clinic, built with [Next.js](https://nextjs.org) and bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Project Overview

This website serves as the digital presence for Ryu Acupuncture Clinic, featuring:

- Appointment booking system
- Service information
- Contact details
- Online shop
- Grievance reporting system
- Administrative dashboard

## Getting Started

First, install the dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

The project follows Next.js 13+ App Router structure:

- `/app` - Main application code
  - `/about` - About page and clinic information
  - `/admin` - Administrative dashboard
  - `/api` - API routes
  - `/request-an-appointment` - Appointment booking system
  - `/contact` - Contact information and form
  - `/services` - Available acupuncture services
  - `/shop` - Online shop
  - `/report-a-grievance` - Grievance reporting system
  - `/ui` - Reusable UI components

## Technologies Used

- Next.js 13+ (App Router)
- TypeScript
- Tailwind CSS
- Lucide Icons
- Vercel (Deployment)

## Development Guidelines

1. Follow the existing component structure in the `/ui` directory
2. Use TypeScript for all new components and features
3. Maintain responsive design principles
4. Follow accessibility guidelines
5. Write meaningful commit messages

## Deployment

The website is deployed on Vercel. Any push to the main branch will trigger an automatic deployment.

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Lucide Icons](https://lucide.dev/icons/)
- [Original RAC Website](https://www.ryuacupuncture.com/)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
