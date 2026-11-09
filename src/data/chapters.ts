import type { ChapterData } from './types';

export const CHAPTERS: ChapterData[] = [
  {
    id: 'chapter-1',
    title: 'Os Planetas Internos',
    description: 'Explore o Sol e os planetas rochosos do sistema solar interno.',
    badge: 'chapter-1',
    xpReward: 100,
    steps: [
      { id: 'visit-sun',     type: 'visit', bodyId: 'sun',     label: 'Visite o Sol ☀️' },
      { id: 'visit-mercury', type: 'visit', bodyId: 'mercury', label: 'Visite Mercúrio' },
      { id: 'visit-venus',   type: 'visit', bodyId: 'venus',   label: 'Visite Vênus' },
      { id: 'visit-earth',   type: 'visit', bodyId: 'earth',   label: 'Visite a Terra 🌍' },
      { id: 'answer-earth',  type: 'answer', bodyId: 'earth',  label: 'Responda uma missão na Terra' },
    ],
  },
  {
    id: 'chapter-2',
    title: 'Os Gigantes Gasosos',
    description: 'Viaje até os gigantes gasosos e descubra seus segredos.',
    badge: 'chapter-2',
    xpReward: 150,
    steps: [
      { id: 'visit-mars',    type: 'visit', bodyId: 'mars',    label: 'Visite Marte 🔴' },
      { id: 'visit-jupiter', type: 'visit', bodyId: 'jupiter', label: 'Visite Júpiter' },
      { id: 'visit-saturn',  type: 'visit', bodyId: 'saturn',  label: 'Visite Saturno 🪐' },
      { id: 'discover-1',    type: 'discover', count: 1,       label: 'Descubra 1 objeto oculto 🔍' },
    ],
  },
  {
    id: 'chapter-3',
    title: 'As Fronteiras Geladas',
    description: 'Alcance as bordas geladas do sistema solar.',
    badge: 'chapter-3',
    xpReward: 200,
    steps: [
      { id: 'visit-uranus',  type: 'visit', bodyId: 'uranus',  label: 'Visite Urano' },
      { id: 'visit-neptune', type: 'visit', bodyId: 'neptune', label: 'Visite Netuno' },
      { id: 'visit-pluto',   type: 'visit', bodyId: 'pluto',   label: 'Visite Plutão' },
      { id: 'weekly-done',   type: 'weekly',                   label: 'Complete uma Missão Semanal 📅' },
    ],
  },
  {
    id: 'chapter-4',
    title: 'Explorador Completo',
    description: 'Prove que é o maior explorador do sistema solar!',
    badge: 'chapter-4',
    xpReward: 300,
    steps: [
      { id: 'visit-moon',    type: 'visit', bodyId: 'moon',    label: 'Visite a Lua 🌙' },
      { id: 'discover-3',    type: 'discover', count: 3,       label: 'Descubra 3 objetos ocultos 🔍' },
      { id: 'grande-done',   type: 'grande',                   label: 'Complete a Grande Missão 🏆' },
    ],
  },
];
