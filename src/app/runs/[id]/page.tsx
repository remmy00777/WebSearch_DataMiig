import RunView from './run-view';

export default async function RunPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <RunView id={params.id} />;
}
