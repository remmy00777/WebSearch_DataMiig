import RunView from './run-view';

export default function RunPage({ params }: { params: { id: string } }) {
  return <RunView id={params.id} />;
}
