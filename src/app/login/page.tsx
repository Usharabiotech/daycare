import { allUsers } from '@/services/auth';
import { signIn } from '../actions';

export default async function Login({ searchParams }: { searchParams: { next?: string } }) {
  const users = await allUsers();
  const family = users.filter((u) => u.role === 'family');
  const centre = users.filter((u) => u.role === 'centre_admin');
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div>
        <div className="eyebrow">Demo sign-in</div>
        <h1>Choose who to act as</h1>
        <p className="lede">This build uses sample accounts so you can switch between a family and a centre director. Replace with real authentication before a pilot.</p>
      </div>
      {[{ title: 'Family', list: family, next: searchParams.next || '/waitlists' }, { title: 'Centre director', list: centre, next: '/centre' }].map((g) => (
        <section className="panel" key={g.title}>
          <h2>{g.title}</h2>
          {g.list.map((u) => (
            <form action={signIn} key={u.id} className="row" style={{ justifyContent: 'space-between' }}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="next" value={g.next} />
              <span>{u.name}<div className="small">{u.email}</div></span>
              <button className="btn small primary" type="submit">Sign in</button>
            </form>
          ))}
        </section>
      ))}
    </div>
  );
}
